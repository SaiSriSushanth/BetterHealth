import { add, ZERO, scale } from "../nutrition/estimate";
import type { Nutrients } from "../types";
import { DENSE_INGREDIENT, headOk, MIN_INGREDIENT_SCORE, type SearchFn } from "./common";
import type { RefFood } from "./types";
import type { VisionItem } from "./vision";

export interface RecipeResult {
  /** Nutrients of the whole portion: sum of matched raw ingredients. */
  total: Nutrients;
  /** Share (0..1) of the listed ingredient mass that was matched to a reference row. */
  coverage: number;
  matched: { ingredient: string; ref: string }[];
}

/** A non-oil ingredient ("groundnut") must never resolve to an oil row. */
const OIL = /(?:^|[^a-z])oil(?:$|[^a-z])/i;

/** Rare species/variants lose to the everyday food unless the ingredient names them ("egg" -> hen's egg, not duck). */
const RARE = /(?<![a-z])(duck|goose|quail|turkey|emu|ostrich|rabbit|pigeon|dove|squab|buffalo|yak|camel|goat)(?![a-z])/i;

/** Parts of a food ("egg" must not become egg yolk). */
const PART = /(?<![a-z])(yolk|albumen|shell|bone|bones|skin|peel|rind|husk|bran|germ)(?![a-z])/i;

/** Processed forms ("coconut" must not become coconut water, "groundnut" not peanut butter) unless the ingredient asks for them. */
const FORM = /(?<![a-z])(water|juice|milk|oil|flour|powder|extract|syrup|cake|butter|cream|dressing|sauce|paste|pickle|chutney)(?![a-z])/gi;
function unaskedForm(rowName: string, ingredient: string): boolean {
  const asked = new Set((ingredient.toLowerCase().match(FORM) ?? []));
  return (rowName.toLowerCase().match(FORM) ?? []).some((w) => !asked.has(w));
}

/** Prefer raw rows for raw weights: cooked/dish rows are penalised so a raw match wins ties. */
function effectiveScore(f: RefFood, ingredient: string): number {
  const cooked = f.state === "cooked" || f.state === "dish";
  // Ingredient weights are raw/dry, so a cooked row for a swelling staple would double-count the water.
  const rawWanted = SWELLS.test(ingredient) || /(?<![a-z])(raw|dry|dried)(?![a-z])/i.test(ingredient);
  return f.score - (cooked ? (rawWanted ? 0.4 : 0.1) : 0)
    - (RARE.test(f.name) && !RARE.test(ingredient) ? 0.3 : 0)
    - (PART.test(f.name) && !PART.test(ingredient) ? 0.3 : 0)
    - (unaskedForm(f.name, ingredient) ? 0.3 : 0)
    - (firstWordMismatch(f.name, ingredient) ? 0.2 : 0);
}

/** "ginger" should prefer "Ginger, fresh" over "Mango ginger": the row should lead with the ingredient's first word. */
function firstWordMismatch(rowName: string, ingredient: string): boolean {
  const a = tok(rowName)[0];
  const b = tok(ingredient).find((w) => !GENERIC.has(w));
  return !!a && !!b && a !== b;
}

/** Words that describe a form, not the food: they may be missing from the matched row ("ragi flour" -> "Ragi"). */
const GENERIC = new Set(["flour", "powder", "raw", "dry", "dried", "whole", "fresh", "seed", "fruit", "leaf", "big", "small", "ripe",
  "green", "red", "white", "black", "yellow", "cooked", "boiled", "fried", "chopped", "sliced", "mixed", "ground", "split", "paste"]);
const tok = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1)
  .map((w) => (w.length > 3 && w.endsWith("ies") ? w.slice(0, -3) + "y" : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));

/** Every distinctive word of the ingredient must appear in the row's name or aliases, so "ragi flour" never lands on "Flour, rye". */
function distinctiveOk(ingredient: string, f: RefFood): boolean {
  const need = [...new Set(tok(ingredient).filter((w) => !GENERIC.has(w)))];
  if (!need.length) return true;
  const have = new Set([f.name, ...f.aliases].flatMap(tok));
  return need.every((w) => have.has(w));
}

/** Nothing to look up: water adds mass but no nutrients; salt and spice mixes are too small to matter. */
const WATER = /^(water|ice)$/i;
const NEGLIGIBLE = /^(salt|spices?|masala|spice mix|curry leaves?|mustard seeds?|cumin|turmeric|chil+i powder|asafoetida|hing)$/i;

/** Dry staples that swell when cooked (rice, dal, pasta, oats...). Raw weight x factor ~ cooked weight. */
const SWELLS = /(?<![a-z])(rice|dal|lentils?|pulses?|beans?|rajma|chana|chole|chickpeas?|pasta|noodles?|macaroni|spaghetti|vermicelli|oats|quinoa|semolina|rava|sooji|poha)(?![a-z])/i;
const SWELL_FACTOR = 2.4;

/**
 * Sums reference values over a dish's ingredient list (RAW weights). Unmatched ingredients add nothing
 * (they are usually spices or water) but reduce `coverage`. Returns null when too little is matched.
 */
export async function groundRecipe(
  item: Pick<VisionItem, "ingredients">,
  regions: string[],
  search: SearchFn,
  minCoverage: number,
  dishGrams?: number,
): Promise<RecipeResult | null> {
  const ings = item.ingredients.filter((i) => i.grams > 0 && i.name.trim() && !NEGLIGIBLE.test(i.name.trim()));
  const totalMass = ings.reduce((s, i) => s + i.grams, 0);
  if (!ings.length || totalMass <= 0) return null;

  const rows = await Promise.all(ings.map((i) => (WATER.test(i.name.trim()) ? Promise.resolve([] as RefFood[]) : search(i.name.trim(), regions))));
  let total: Nutrients = { ...ZERO };
  let matchedMass = 0;
  let denseMissing = false;
  const matched: RecipeResult["matched"] = [];
  /** Mass each ingredient will have once served: dry staples swell, unless the matched row is already cooked. */
  let servedMass = 0;
  ings.forEach((ing, idx) => {
    if (WATER.test(ing.name.trim())) { matchedMass += ing.grams; servedMass += ing.grams; return; }
    const best = rows[idx]
      .filter((f) => f.score >= MIN_INGREDIENT_SCORE && f.per100.kcal <= 900 && (OIL.test(ing.name) || !OIL.test(f.name))
        && headOk(ing.name, f.name, f.source) && distinctiveOk(ing.name, f))
      .sort((a, b) => effectiveScore(b, ing.name) - effectiveScore(a, ing.name))[0];
    if (!best) {
      if (DENSE_INGREDIENT.test(ing.name)) denseMissing = true;
      servedMass += ing.grams;
      return;
    }
    // Ingredient weights are raw. A swelling staple matched to a COOKED row is converted to its cooked weight first, so
    // the water is counted once; matched to a raw row, only the served weight swells.
    const swells = SWELLS.test(ing.name) && !/(?<![a-z])(cooked|boiled|steamed)(?![a-z])/i.test(ing.name);
    const bestCooked = best.state === "cooked" || best.state === "dish";
    servedMass += ing.grams * (swells ? SWELL_FACTOR : 1);
    total = add(total, scale(best.per100, (swells && bestCooked ? ing.grams * SWELL_FACTOR : ing.grams) / 100));
    matchedMass += ing.grams;
    matched.push({ ingredient: ing.name, ref: best.name });
  });
  const coverage = matchedMass / totalMass;
  if (denseMissing || coverage < minCoverage || !matched.length) return null;

  // Mass balance: models list raw weights as if the whole plate were dry. If dry staples swelled to their cooked weight and
  // the plate would outweigh the serving, scale the recipe down to fit. Skipped when water is listed (the model already did the sums).
  if (dishGrams && dishGrams > 0 && !ings.some((i) => WATER.test(i.name.trim()))) {
    if (servedMass > dishGrams * 1.15) total = scale(total, dishGrams / servedMass);
  }
  return { total, coverage, matched };
}
