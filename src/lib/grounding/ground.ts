import { FOODS } from "../nutrition/table";
import { scale } from "../nutrition/estimate";
import type { FoodEntry, Nutrients } from "../types";
import {
  contentTokens, densityOk, gateLabels, headOk, MAX_WEB_PER_REQUEST, memoSearch, MIN_RECIPE_COVERAGE, MIN_SCORE, modelDensity,
  PORTION_MAX_RATIO, PORTION_MIN_RATIO, WEAK_RECIPE_COVERAGE, type SearchFn,
} from "./common";
import { groundRecipe } from "./recipe";
import { publicSource, type Confidence, type GroundedItem, type GroundFlags, type Ref, type RefFood } from "./types";
import { fallbackToNutrients, type VisionItem } from "./vision";

/**
 * Pure grounding logic. All IO is injected so every stage is unit-testable.
 * Stage order per item, first success wins: table -> reference DB -> recipe -> web -> model.
 */

export interface GroundDeps {
  regions: string[];
  /** search_reference_foods wrapper. Errors must resolve to []. */
  search: SearchFn;
  /** Web lookup returning a validated per-100g row, or null. Called at most MAX_WEB_PER_REQUEST times. */
  web?: (query: string) => Promise<RefFood | null>;
  maxWeb?: number;
  /** Breaks a dish with no usable ingredient list into raw ingredients (null on failure). Max 2 calls per request. */
  decompose?: (name: string, grams: number) => Promise<{ name: string; grams: number }[] | null>;
  decomposeTimeoutMs?: number;
  /** Test hook: override the built-in table. */
  foods?: FoodEntry[];
}

export interface GroundResult {
  items: GroundedItem[];
  confidence: Confidence;
  webCalls: number;
}

const uniq = (xs: string[]) => {
  const seen = new Set<string>();
  return xs.map((x) => x.trim()).filter((x) => {
    const k = x.toLowerCase();
    if (!x || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

/**
 * Terms used to look an item up, most specific first.
 * - item.name always qualifies.
 * - search_terms[0] qualifies only if it is at least as specific as the name (its content tokens are a superset),
 *   so "chutney" cannot stand in for "peanut chutney".
 * - later terms are broader fallbacks ("paneer" for "paneer cubes") and may only ground ingredient|packaged items,
 *   never dishes or drinks ("juice" must not ground "watermelon juice").
 */
export const dbTerms = (i: VisionItem) => {
  const name = contentTokens(i.name);
  const t0 = i.search_terms[0] ?? "";
  const t0Tokens = contentTokens(t0);
  const first = t0 && name.every((w) => t0Tokens.includes(w)) ? [t0] : [];
  const later = i.kind === "ingredient" || i.kind === "packaged" ? i.search_terms.slice(1) : [];
  return uniq([...first, i.name, ...later]).slice(0, 4);
};

/** Table row whose name or alias passes the lexical gate for `term` (fewest extra tokens wins). */
function tableCandidate(term: string, foods: FoodEntry[]): FoodEntry | null {
  let best: { f: FoodEntry; extra: number } | null = null;
  for (const f of foods) {
    const e = gateLabels(term, [f.name, ...f.aliases]);
    if (e !== null && (!best || e < best.extra)) best = { f, extra: e };
  }
  return best?.f ?? null;
}

function closestPortionRatio(grams: number, portions: RefFood["portions"]): number | null {
  const ps = portions.filter((p) => p.grams > 0);
  if (!ps.length || grams <= 0) return null;
  let best = ps[0].grams;
  for (const p of ps) if (Math.abs(Math.log(grams / p.grams)) < Math.abs(Math.log(grams / best))) best = p.grams;
  return grams / best;
}

export function portionImplausible(grams: number, portions: RefFood["portions"]): boolean {
  const r = closestPortionRatio(grams, portions);
  return r !== null && (r > PORTION_MAX_RATIO || r < PORTION_MIN_RATIO);
}

const noFlags = (): GroundFlags => ({ densityRejected: false, implausiblePortion: false, weakRecipe: false });

interface Stage {
  nutrients: Nutrients;
  ref: Ref;
  food?: RefFood;
  /** Recipe total is far from the model's own estimate: worth a web check if budget allows. */
  disputed?: boolean;
}

function dbStage(food: RefFood, grams: number): Stage {
  return {
    nutrients: scale(food.per100, grams / 100),
    ref: { source: publicSource(food.source), name: food.name, score: Math.round(food.score * 100) / 100 },
    food,
  };
}

/** Best acceptable row among candidates; reports whether a good-scoring row was refused on density. */
function pickRow(rows: RefFood[], md: number): { food: RefFood | null; rejected: boolean } {
  let rejected = false;
  let best: RefFood | null = null;
  for (const f of rows) {
    if (f.score < MIN_SCORE) continue;
    if (!densityOk(f.per100.kcal, md)) { rejected = true; continue; }
    if (!best || f.score > best.score) best = f;
  }
  return { food: best, rejected };
}

async function groundOne(item: VisionItem, grams: number, deps: GroundDeps, flags: GroundFlags): Promise<Stage | null> {
  const md = modelDensity(item.fallback_nutrients.kcal, grams);
  const foods = deps.foods ?? FOODS;

  // a. built-in table
  for (const t of dbTerms(item)) {
    const f = tableCandidate(t, foods);
    if (!f) continue;
    if (!densityOk(f.per100.kcal, md)) { flags.densityRejected = true; continue; }
    return { nutrients: scale(f.per100, grams / 100), ref: { source: "table", name: f.name } };
  }

  // b. reference database, all terms in parallel
  const terms = dbTerms(item);
  const perTerm = await Promise.all(terms.map((t) => deps.search(t, deps.regions)));
  const rows = perTerm.flatMap((rs, k) => rs.filter((f) => gateLabels(terms[k], [f.name, ...f.aliases]) !== null && headOk(terms[k], f.name, f.source)));
  const pick = pickRow(rows, md);
  if (pick.rejected) flags.densityRejected = true;
  if (pick.food) {
    if (portionImplausible(grams, pick.food.portions)) flags.implausiblePortion = true;
    return dbStage(pick.food, grams);
  }

  // c. recipe over raw ingredients
  if (item.kind === "dish" && !needsDecomposition(item)) {
    return recipeStage(item.ingredients, grams, deps, flags, md);
  }
  return null;
}

export const MAX_DECOMPOSE_PER_REQUEST = 2;
const RECIPE_MAX_KCAL_PER_100G = 700;

/** True for dishes whose ingredient list is empty or just the dish itself ("vada pav" listing "vada pav"). */
export function needsDecomposition(item: VisionItem): boolean {
  if (item.kind !== "dish") return false;
  const ings = item.ingredients.filter((i) => i.grams > 0 && i.name.trim());
  if (!ings.length) return true;
  return ings.length === 1 && contentTokens(ings[0].name).join(" ") === contentTokens(item.name).join(" ");
}

/** Recipe vs the model's own guess: outside this ratio band the two independent estimates disagree. */
const DISPUTE_LOW = 0.5;
const DISPUTE_HIGH = 2;

async function recipeStage(
  ingredients: { name: string; grams: number }[], grams: number, deps: GroundDeps, flags: GroundFlags, md: number,
): Promise<Stage | null> {
  const r = await groundRecipe({ ingredients }, deps.regions, deps.search, MIN_RECIPE_COVERAGE, grams);
  if (!r) return null;
  // The model's own density is exactly what decomposition corrects, so only a loose physical bound applies here.
  if (modelDensity(r.total.kcal, grams) > RECIPE_MAX_KCAL_PER_100G) { flags.densityRejected = true; return null; }
  if (r.coverage < WEAK_RECIPE_COVERAGE) flags.weakRecipe = true;
  const ratio = md > 0 ? modelDensity(r.total.kcal, grams) / md : 1;
  return {
    nutrients: r.total, ref: { source: "recipe", name: r.matched.map((m) => m.ref).slice(0, 4).join(" + ") },
    disputed: ratio < DISPUTE_LOW || ratio > DISPUTE_HIGH,
  };
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  let t: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([p, new Promise<null>((res) => { t = setTimeout(() => res(null), ms); })]);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

const LEVELS: Confidence[] = ["low", "medium", "high"];

/** Each distinct doubt (any AI-only item, implausible portion, rejected/weak data) lowers confidence one level. */
export function downgradeConfidence(base: Confidence, items: GroundedItem[], flags: GroundFlags[]): Confidence {
  if (!items.length) return "low";
  let drop = 0;
  if (items.some((i) => i.ref.source === "ai")) drop++;
  if (flags.some((f) => f.implausiblePortion)) drop++;
  if (flags.some((f) => f.densityRejected || f.weakRecipe)) drop++;
  return LEVELS[Math.max(0, LEVELS.indexOf(base) - drop)];
}

export async function groundItems(vision: VisionItem[], baseConfidence: Confidence, deps: GroundDeps): Promise<GroundResult> {
  const search = memoSearch(deps.search);
  const d: GroundDeps = { ...deps, search };
  const grams = vision.map((i) => Math.max(1, Math.round(i.grams)));
  const flags = vision.map(noFlags);

  // a-c in parallel (pure lookups)
  const stages: (Stage | null)[] = await Promise.all(vision.map((i, k) => groundOne(i, grams[k], d, flags[k])));

  // c2. decompose dishes that had no usable ingredient list, then run the recipe stage on the result
  if (deps.decompose) {
    const decompose = deps.decompose;
    const todo = stages.map((s, k) => (!s && needsDecomposition(vision[k]) ? k : -1)).filter((k) => k >= 0).slice(0, MAX_DECOMPOSE_PER_REQUEST);
    const lists = await Promise.all(todo.map((k) => withTimeout(decompose(vision[k].name, grams[k]), deps.decomposeTimeoutMs ?? 8000)));
    await Promise.all(todo.map(async (k, n) => {
      const ings = lists[n];
      if (!ings?.length) return;
      stages[k] = await recipeStage(ings, grams[k], d, flags[k], modelDensity(vision[k].fallback_nutrients.kcal, grams[k]));
    }));
  }

  // d. web, bounded: ungrounded items first, then recipes that disagree with the model's own estimate
  let webCalls = 0;
  if (deps.web) {
    const cap = Math.min(deps.maxWeb ?? MAX_WEB_PER_REQUEST, MAX_WEB_PER_REQUEST);
    const open = stages.map((s, k) => (s ? -1 : k)).filter((k) => k >= 0);
    const disputed = stages.map((s, k) => (s?.disputed ? k : -1)).filter((k) => k >= 0);
    const todo = [...open, ...disputed].slice(0, cap);
    webCalls = todo.length;
    const web = deps.web;
    const found = await Promise.all(todo.map((k) => web(dbTerms(vision[k])[0]).catch(() => null)));
    todo.forEach((k, n) => {
      const f = found[n];
      const wasDisputed = !!stages[k]?.disputed;
      if (!f) { if (wasDisputed) flags[k].weakRecipe = true; return; }
      const md = modelDensity(vision[k].fallback_nutrients.kcal, grams[k]);
      // A disputed recipe already disagrees with the model, so the model's density cannot referee the web row.
      if (!wasDisputed && !densityOk(f.per100.kcal, md)) { flags[k].densityRejected = true; return; }
      if (f.per100.kcal > RECIPE_MAX_KCAL_PER_100G) return;
      if (portionImplausible(grams[k], f.portions)) flags[k].implausiblePortion = true;
      stages[k] = dbStage({ ...f, source: "web" }, grams[k]);
    });
  }

  // e. the model's own numbers
  const items: GroundedItem[] = vision.map((i, k) => {
    const s = stages[k] ?? { nutrients: fallbackToNutrients(i.fallback_nutrients), ref: { source: "ai", name: i.name.trim() || "Food" } as Ref };
    return {
      name: i.name.trim() || "Food",
      portion: i.portion.trim() || `${grams[k]} g`,
      grams: grams[k],
      nutrients: s.nutrients,
      ref: s.ref,
    };
  });
  return { items, confidence: downgradeConfidence(baseConfidence, items, flags), webCalls };
}
