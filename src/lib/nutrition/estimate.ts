import type { FoodEntry, Nutrients } from "@/lib/types";
import { FOODS } from "./table";

export const ZERO: Nutrients = {
  kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, fiberG: 0, sugarG: 0,
  sodiumMg: 0, potassiumMg: 0, calciumMg: 0, ironMg: 0, vitCMg: 0,
};

export function normalize(q: string): string {
  return q
    .toLowerCase()
    .replace(/[\u00bd\u00bc\u00be]/g, (c) => ({ "\u00bd": " 1/2 ", "\u00bc": " 1/4 ", "\u00be": " 3/4 " })[c] ?? c)
    .replace(/[^\p{L}\p{N}./\s]/gu, " ")
    .replace(/(^|\s)\.+|\.+(?=\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const UNIT_GRAMS: Record<string, number> = {
  g: 1, gram: 1, grams: 1, gm: 1, kg: 1000, ml: 1, l: 1000,
  cup: 240, cups: 240, tbsp: 15, tablespoon: 15, tablespoons: 15,
  tsp: 5, teaspoon: 5, teaspoons: 5, oz: 28.35, glass: 240, glasses: 240,
};
const COUNT_UNITS = new Set([
  "piece", "pieces", "pcs", "slice", "slices", "serving", "servings",
  "bowl", "bowls", "plate", "plates", "scoop", "scoops", "small", "medium", "large",
]);
const FRACTIONS: Record<string, number> = { "1/2": 0.5, "1/4": 0.25, "3/4": 0.75, "1/3": 0.33, "2/3": 0.67, "1/8": 0.125 };
const WORD_NUMS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, half: 0.5, couple: 2,
};

export interface ParsedSegment {
  quantity: number;
  /** grams per unit if a weight/volume unit was given, else null (= pieces/servings) */
  unitGrams: number | null;
  unitLabel: string;
  name: string;
}

export function parseSegment(raw: string): ParsedSegment | null {
  const tokens = normalize(raw).replace(/^(of|some)\s+/, "").split(" ").filter(Boolean);
  if (!tokens.length) return null;
  let quantity = 1;
  let i = 0;
  const first = tokens[0];
  const glued = first.match(/^(\d+(?:\.\d+)?)(g|gm|kg|ml|l|oz)$/);
  if (glued) {
    quantity = parseFloat(glued[1]);
    tokens.splice(0, 1, glued[2]);
    // re-read: quantity consumed, unit is now tokens[0]
    return finishUnit(quantity, tokens, 0);
  }
  if (/^\d+(\.\d+)?$/.test(first)) {
    quantity = parseFloat(first);
    i = 1;
    if (tokens[1] && FRACTIONS[tokens[1]]) { quantity += FRACTIONS[tokens[1]]; i = 2; }
  } else if (FRACTIONS[first]) {
    quantity = FRACTIONS[first]; i = 1;
  } else if (WORD_NUMS[first] !== undefined && tokens.length > 1) {
    quantity = WORD_NUMS[first]; i = 1;
  }
  return finishUnit(quantity, tokens, i);
}

function finishUnit(quantity: number, tokens: string[], i: number): ParsedSegment | null {
  let unitGrams: number | null = null;
  let unitLabel = "";
  const u = tokens[i];
  if (u && UNIT_GRAMS[u] !== undefined) {
    unitGrams = UNIT_GRAMS[u]; unitLabel = u; i++;
  } else if (u && COUNT_UNITS.has(u)) {
    unitLabel = u; i++;
  }
  if (tokens[i] === "of") i++;
  while (tokens[i] === "a" || tokens[i] === "an" || tokens[i] === "the") i++;
  const name = tokens.slice(i).join(" ");
  if (!name || quantity <= 0) return null;
  return { quantity, unitGrams, unitLabel, name };
}

function singular(w: string) {
  return w.endsWith("ies") ? w.slice(0, -3) + "y" : w.endsWith("es") && w.length > 4 ? w.slice(0, -2) : w.endsWith("s") ? w.slice(0, -1) : w;
}

export function matchFood(name: string, foods: FoodEntry[] = FOODS): FoodEntry | null {
  const n = normalize(name);
  const qTokens = new Set(n.split(" ").map(singular));
  let best: { f: FoodEntry; score: number } | null = null;
  for (const f of foods) {
    for (const label of [f.name, ...f.aliases]) {
      const l = normalize(label);
      let score = 0;
      if (l === n) score = 100;
      else {
        const lTokens = l.split(" ").map(singular);
        const hit = lTokens.filter((t) => qTokens.has(t)).length;
        if (hit === 0) continue;
        const coverage = hit / lTokens.length; // how much of the label is in the query
        const precision = hit / qTokens.size; // how much of the query is explained
        score = coverage * 50 + precision * 40 + (n.includes(l) ? 10 : 0);
        if (coverage < 0.6) continue;
      }
      if (!best || score > best.score) best = { f, score };
    }
  }
  return best && best.score >= 45 ? best.f : null;
}

export function scale(n: Nutrients, factor: number): Nutrients {
  const out = { ...n };
  for (const k of Object.keys(out) as (keyof Nutrients)[]) {
    out[k] = Math.round(n[k] * factor * 10) / 10;
  }
  out.kcal = Math.round(out.kcal);
  return out;
}

export function add(a: Nutrients, b: Nutrients): Nutrients {
  const out = { ...a };
  for (const k of Object.keys(out) as (keyof Nutrients)[]) out[k] = Math.round((a[k] + b[k]) * 10) / 10;
  return out;
}

export interface EstimatedItem {
  name: string;
  portion: string;
  grams: number;
  nutrients: Nutrients;
  /** Where the numbers came from (photo grounding). */
  ref?: { source: string; name: string };
}

export interface Estimate {
  items: EstimatedItem[];
  /** segments we could not match */
  unmatched: string[];
}

const CUP_LIKE = new Set(["cup", "cups", "glass", "glasses"]);
const LIQUID = /milk|juice|water|tea|coffee|soda|cola|lassi|soup|buttermilk|smoothie|broth|beer|wine|drink/;
/** A cup of water weighs 240 g; dry or bulky foods weigh much less, so scale the 240 g default. */
function cupFactor(f: FoodEntry): number {
  const n = f.name.toLowerCase();
  if (LIQUID.test(n)) return 1;
  if (/cooked|boiled|steamed|dal|curry/.test(n)) return 0.7;
  if (f.per100.kcal > 300) return 0.38; // dry or energy-dense: oats, nuts, flour
  return 0.6;
}

function exactFood(name: string): FoodEntry | null {
  const n = normalize(name);
  return FOODS.find((f) => [f.name, ...f.aliases].some((l) => normalize(l) === n)) ?? null;
}

export function estimateFromTable(query: string): Estimate {
  // "mac and cheese", "coffee with milk": if the whole text is one known food, do not split it.
  const whole = parseSegment(query);
  if (whole && exactFood(whole.name)) return estimateFromTableSegments([query]);
  return estimateFromTableSegments(query.split(/,(?!\d)|\+|&|\band\b|\bwith\b/i).map((s) => s.trim()).filter(Boolean));
}

function estimateFromTableSegments(segments: string[]): Estimate {
  const items: EstimatedItem[] = [];
  const unmatched: string[] = [];
  for (const seg of segments) {
    const p = parseSegment(seg);
    const food = p && matchFood(p.name);
    if (!p || !food) { unmatched.push(seg); continue; }
    let grams: number;
    if (p.unitGrams !== null) grams = p.quantity * (CUP_LIKE.has(p.unitLabel) ? p.unitGrams * cupFactor(food) : p.unitGrams);
    else if (food.pieceGrams && p.unitLabel !== "serving" && p.unitLabel !== "bowl" && p.unitLabel !== "plate")
      grams = p.quantity * food.pieceGrams;
    else grams = p.quantity * food.serving.grams;
    grams = Math.min(5000, Math.max(1, Math.round(grams)));
    const portion = p.unitLabel ? `${p.quantity} ${p.unitLabel}` : food.pieceGrams ? `${p.quantity} piece` : `${p.quantity} × ${food.serving.label}`;
    items.push({ name: food.name, portion, grams, nutrients: scale(food.per100, grams / 100) });
  }
  return { items, unmatched };
}

/** kcal should be roughly 4P + 4C + 9F. Used to reject bad AI output. */
export function macrosAreConsistent(n: Nutrients, tolerance = 0.15): boolean {
  const calc = n.proteinG * 4 + n.carbsG * 4 + n.fatG * 9;
  if (n.kcal < 20 && calc < 20) return true;
  return Math.abs(n.kcal - calc) <= Math.max(tolerance * Math.max(n.kcal, calc), 15);
}
