import type { RefFood } from "./types";

/** Minimum search score for a reference row to be trusted as the item itself. */
export const MIN_SCORE = 0.75;
/** Raw ingredients inside a recipe may match a little looser (names are shorter). */
export const MIN_INGREDIENT_SCORE = 0.7;
/** Share of a dish's ingredient mass that must be matched for the recipe stage to count. */
export const MIN_RECIPE_COVERAGE = 0.7;
/** Recipe coverage below this lowers the request confidence. */
export const WEAK_RECIPE_COVERAGE = 0.85;
/** DB kcal/100 g must be within these multiples of the model's own density. */
export const DENSITY_MIN = 0.4;
export const DENSITY_MAX = 2.5;
/** Maximum web searches per request. */
export const MAX_WEB_PER_REQUEST = 3;
/** Portion plausibility band against the closest typical DB portion. */
export const PORTION_MAX_RATIO = 4;
export const PORTION_MIN_RATIO = 0.25;

export type SearchFn = (term: string, regions: string[]) => Promise<RefFood[]>;

/** Absolute slack (kcal/100 g) so near-zero foods like water or tea do not fail on ratios. */
const DENSITY_SLACK = 10;

export function densityOk(dbKcalPer100: number, modelKcalPer100: number): boolean {
  return dbKcalPer100 >= modelKcalPer100 * DENSITY_MIN - DENSITY_SLACK && dbKcalPer100 <= modelKcalPer100 * DENSITY_MAX + DENSITY_SLACK;
}

export function modelDensity(kcal: number, grams: number): number {
  return grams > 0 ? (kcal / grams) * 100 : 0;
}

/** Wraps a search function so repeated (term, regions) lookups within one request hit the DB once. */
export function memoSearch(search: SearchFn): SearchFn {
  const cache = new Map<string, Promise<RefFood[]>>();
  return (term, regions) => {
    const key = `${regions.join(",")}|${term.toLowerCase().trim()}`;
    let hit = cache.get(key);
    if (!hit) {
      hit = search(term, regions).catch(() => []);
      cache.set(key, hit);
    }
    return hit;
  };
}

// ---- Lexical gate -------------------------------------------------------------------------------------------

const STOP = new Set(["nfs", "ns", "as", "to", "form", "type", "with", "and", "of", "the", "plain", "a", "an", "in", "on", "over", "or"]);
const CONNECTORS = new Set(["with", "and", "in", "on", "over"]);
export const MAX_EXTRA_TOKENS = 2;

function stem(w: string): string {
  if (w.length > 3 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 4 && /(oes|ses|xes|ches|shes)$/.test(w)) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us")) return w.slice(0, -1);
  return w;
}

function words(s: string): string[] {
  return s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(stem);
}

/**
 * Does `label` name the same thing as `query`? Returns the number of extra content tokens in the label
 * (0 for an exact match), or null when it is not an acceptable match.
 * Rules: exact equality passes; otherwise the label must contain every content token of the query and add at most
 * MAX_EXTRA_TOKENS more; if the query is a composite ("pasta with tomato sauce") only an exact label or one that
 * also carries the connector may match, so a component ("tomato pasta sauce") never stands in for the dish.
 */
export function lexicalGate(query: string, label: string): number | null {
  const q = words(query);
  const l = words(label);
  if (!q.length || !l.length) return null;
  if (q.join(" ") === l.join(" ")) return 0;
  const qc = [...new Set(q.filter((w) => !STOP.has(w)))];
  const lc = new Set(l.filter((w) => !STOP.has(w)));
  if (!qc.length) return null;
  const conn = q.filter((w) => CONNECTORS.has(w));
  if (conn.length && !conn.every((c) => l.includes(c))) return null;
  if (!qc.every((w) => lc.has(w))) return null;
  const extra = lc.size - qc.length;
  return extra <= MAX_EXTRA_TOKENS ? extra : null;
}

/** Best (lowest) extra count over a name and its aliases, or null if none passes. */
export function gateLabels(query: string, labels: string[]): number | null {
  let best: number | null = null;
  for (const l of labels) {
    const e = lexicalGate(query, l);
    if (e !== null && (best === null || e < best)) best = e;
  }
  return best;
}

/**
 * USDA names put the head noun first ("Cream, heavy", "Cake, cream", "Salad dressing, caesar"). For USDA rows a
 * non-exact match is only trusted when the head segment (before the first comma) is made of words the query itself
 * uses, so "cream" never lands on "Cake, cream" and "caesar salad" never lands on "Salad dressing, caesar". This
 * also stops generated reordering aliases ("caesar salad dressing") from vouching for the wrong food. IFCT, web and
 * table rows are exempt (their names are not head-first).
 */
export function headOk(query: string, name: string, source: string): boolean {
  if (!source.startsWith("usda")) return true;
  const q = words(query);
  if (q.join(" ") === words(name).join(" ")) return true;
  const qc = new Set(q.filter((w) => !STOP.has(w)));
  const head = words(name.split(",")[0]).filter((w) => !STOP.has(w));
  return head.length > 0 && head.every((w) => qc.has(w));
}

/** Distinct content tokens (stopwords removed, singularised) of a phrase. */
export function contentTokens(s: string): string[] {
  return [...new Set(words(s).filter((w) => !STOP.has(w)))];
}

/** Calorie-dense ingredients: leaving one unmatched can hide 100+ kcal, so a recipe missing one is not trusted. */
export const DENSE_INGREDIENT = /\b(oil|ghee|butter|cream|sugar|jaggery|gur|cheese|coconut|nuts?|peanuts?|groundnuts?|almonds?|cashews?|mayonnaise|mayo|syrup|honey)\b/i;
