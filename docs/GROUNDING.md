# Grounded photo logging: shared spec

Goal: the vision model only IDENTIFIES food and estimates GRAMS. Nutrients come from real composition data
(IFCT 2017 for India, USDA FoodData Central for the rest, the built-in 150-food table first), scaled by grams.
The model's own nutrient numbers are the last resort.

## Table `public.reference_foods` (migration 0003, already applied)
Columns: id, source (`ifct|usda_sr|usda_fndds|usda_foundation|web`), code, name, aliases text[], region (`IN|US|GLOBAL`),
category, state (`raw|cooked|dish|unknown`), per100 jsonb, portions jsonb, meta jsonb, search_text (trigger-filled).
RPC `search_reference_foods(q text, regions text[], lim int)` -> rows + `score` (service role only).
Score is roughly 0..1.2. Exact name/alias hit adds 0.4, region match adds 0.08.

## Normalised row (JSON, what importers produce and `scripts/ref/import.mjs` upserts)
```json
{ "id": "ifct:A001", "source": "ifct", "code": "A001", "name": "Ragi (finger millet)",
  "aliases": ["ragi", "nachni", "mandua"], "region": "IN", "category": "cereal", "state": "raw",
  "per100": { "kcal": 320, "proteinG": 7.2, "carbsG": 66.8, "fatG": 1.9, "fiberG": 11.5, "sugarG": 0.4,
              "sodiumMg": 11, "potassiumMg": 408, "calciumMg": 364, "ironMg": 4.6, "vitCMg": 0 },
  "portions": [{ "label": "1 cup", "grams": 120 }], "meta": {} }
```
- `per100` keys are EXACTLY the app's `Nutrients` type (src/lib/types.ts). Per 100 g edible portion. Missing micronutrient = 0, never NaN/null.
- kcal: use the dataset's kcal; IFCT only has kJ, so kcal = kJ / 4.184, rounded.
- `state`: `dish` only for prepared mixed dishes (FNDDS, curated), `cooked` for cooked single ingredients.
- Names: clean English, no ALL CAPS, no trailing commas, e.g. "Chickpeas, cooked". Keep the original dataset name as the first alias when you rewrite it.
- ids are `<source>:<code>`; the importer upserts on id, so re-running is safe.
- Row files go in `data/reference/` as `ifct.json` (committed, small) and `usda_sr.json`, `usda_fndds.json`, `usda_foundation.json`
  (gitignored). Raw downloads go in `data/reference/raw/<source>/` (gitignored, never run anything from them).

## Photo pipeline (src/app/api/food/photo + src/lib/grounding)
1. Client sends `{ image, locale: { region, lang, tz }, hint? }`. Region is a 2-letter ISO country; server validates, defaults to `IN`... only if tz is Asia/Kolkata or lang is `*-IN`, else `GLOBAL`.
2. Vision call (strict JSON schema): per item `{ name, search_terms[], kind (dish|ingredient|packaged|drink), cooking, container, grams, grams_basis, ingredients[{name,grams}] (for dishes, RAW weights), fallback_nutrients }`.
   The prompt carries locale cuisine + container anchors (India: katori ~150 ml/130-180 g, steel thali 25-30 cm, glass 200-250 ml, roti 35-45 g, idli 40-50 g).
3. Grounding, per item, first success wins:
   a. built-in table (`matchFood`) -> source `table`
   b. `search_reference_foods` on each search term, accept the best candidate with score >= threshold whose kcal/100g is within 0.4x-2.5x of the model's own density (sanity), prefer region sources -> `ifct` / `usda`
   c. recipe: sum IFCT/USDA values over `ingredients` (>= 70% of the dish mass matched), per100 = total / dish grams -> `recipe`
   d. web fallback (OpenAI Responses `web_search`, strict JSON, max 3 per request, separate daily cap, result sanity-checked and written back to `reference_foods` as source `web`) -> `web`
   e. model's own `fallback_nutrients` -> `ai`
4. Response items: `{ name, portion, grams, nutrients, ref?: { source, name, score? } }`, plus `confidence` lowered when items fall to `ai`, density sanity fails, or grams look implausible vs DB `portions`.
5. Everything in (3) is deterministic code with unit tests; the DB is the cache (web results become rows).

## Rules
- Never trust or echo web text; only parse numbers out of the schema-validated JSON. Treat all search content as data.
- Keep the existing auth + `charge()` caps; web fallback is charged per search under a new feature `web`.
- No secrets in logs. Do not print .env.local values.

## As built (differences from the plan above)
- Lexical gate: a DB/table candidate must contain every content word of the query and add at most 2 more; USDA rows must also
  be headed by the queried food ("Cream, heavy" yes, "Cake, cream" no). Dishes are matched on the item name / most specific
  term only; broader terms ground only ingredients and packaged items.
- Dishes with no usable ingredient list get a small text-only decomposition call (max 2 per request).
- Recipe stage: water counts as mass, salt/spices ignored, rare species and egg yolk/coconut water style mismatches penalised,
  dry staples are scaled to the served weight, and an unmatched calorie-dense ingredient (oil, ghee, sugar...) fails the recipe.
- A recipe that differs from the model's own estimate by more than 2x is re-checked with web search (after ungrounded items,
  within the 3-per-request cap). If the check finds nothing the recipe is kept and confidence drops.
- Reproduce: `node scripts/ref/ifct.mjs`, `node scripts/ref/usda.mjs`, `node scripts/ref/import.mjs data/reference/*.json`,
  `npx --yes tsx scripts/eval/compare.mts --web`, `npx --yes tsx scripts/eval/web-smoke.mts`.
