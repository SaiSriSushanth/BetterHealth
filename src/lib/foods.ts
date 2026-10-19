/** Pure helpers for saved foods, meals, recents and diary edits. No React, no I/O. */
import type { CustomFood, CustomFoodItem, FoodLog, Meal, Nutrients } from "./types";
import { ZERO, add, scale, type EstimatedItem } from "./nutrition/estimate";

export const NUTRIENT_KEYS = Object.keys(ZERO) as (keyof Nutrients)[];

/** Just the nutrient fields of a diary row (or anything that extends Nutrients). */
export function nutrientsOf(n: Nutrients): Nutrients {
  const out = { ...ZERO };
  for (const k of NUTRIENT_KEYS) out[k] = Number(n[k]) || 0;
  return out;
}

export function sumNutrients(list: Nutrients[]): Nutrients {
  return list.reduce<Nutrients>((acc, n) => add(acc, nutrientsOf(n)), ZERO);
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** "2 eggs" x1.5 -> "3 eggs"; "1 × bowl" x2 -> "2 × bowl"; "toast" x2 -> "2 × toast". */
export function scalePortionLabel(portion: string, factor: number): string {
  if (factor === 1) return portion;
  const p = portion.trim();
  const m = p.match(/^(\d+(?:\.\d+)?)(\s*)(.*)$/);
  if (m) {
    const n = round1(parseFloat(m[1]) * factor);
    return `${n}${m[2]}${m[3]}`.trim();
  }
  return p ? `${round1(factor)} × ${p}` : `${round1(factor)} serving`;
}

/**
 * Patch for a diary row rescaled by `factor`: every nutrient field, grams and the portion label.
 * Pass `grams` when the user typed a weight, so the label becomes "N g".
 */
export function rescaleLog(row: FoodLog, factor: number, opts: { grams?: number } = {}): Pick<FoodLog, "grams" | "portion"> & Nutrients {
  const f = Number.isFinite(factor) && factor > 0 ? factor : 1;
  const n = scale(nutrientsOf(row), f);
  if (opts.grams !== undefined && row.grams > 0) {
    const g = Math.round(opts.grams);
    return { ...n, grams: g, portion: `${g} g` };
  }
  return { ...n, grams: Math.round(row.grams * f), portion: scalePortionLabel(row.portion, f) };
}

/** Portion of a saved food to log: a multiplier of its saved portion, or an exact gram weight. */
export function portionOf(cf: CustomFood, by: { factor: number } | { grams: number }): { factor: number; grams: number; portion: string; nutrients: Nutrients } {
  if ("grams" in by && cf.grams > 0) {
    const g = Math.max(1, Math.round(by.grams));
    const factor = g / cf.grams;
    return { factor, grams: g, portion: `${g} g`, nutrients: scale(cf.nutrients, factor) };
  }
  const factor = "factor" in by && Number.isFinite(by.factor) && by.factor > 0 ? by.factor : 1;
  return { factor, grams: Math.round(cf.grams * factor), portion: scalePortionLabel(cf.portion, factor), nutrients: scale(cf.nutrients, factor) };
}

/** What addFood needs to log a saved food. */
export function customToLog(cf: CustomFood, by: { factor: number } | { grams: number }, meal: Meal): Omit<FoodLog, "id" | "day"> {
  const p = portionOf(cf, by);
  return { meal, name: cf.name, portion: p.portion, grams: p.grams, source: "custom", ...p.nutrients };
}

/** Turn estimate items (or diary rows) into a CustomFood: one item is a food, several are a meal. */
export function itemsToCustomFood(items: (EstimatedItem | CustomFoodItem)[], name: string, favorite = false): Omit<CustomFood, "id"> {
  const clean: CustomFoodItem[] = items.map((it) => ({ name: it.name, grams: Math.max(0, Math.round(it.grams)), nutrients: nutrientsOf(it.nutrients) }));
  const grams = clean.reduce((s, it) => s + it.grams, 0);
  const nutrients = sumNutrients(clean.map((it) => it.nutrients));
  const nm = name.trim() || clean.map((i) => i.name).join(", ");
  if (clean.length === 1) {
    const only = items[0];
    const portion = "portion" in only && only.portion ? only.portion : grams > 0 ? `${grams} g` : "1 serving";
    return { name: nm, portion, grams, nutrients, favorite, kind: "food" };
  }
  return { name: nm, portion: "1 meal", grams, nutrients, favorite, kind: "meal", items: clean };
}

export function logsToItems(rows: FoodLog[]): EstimatedItem[] {
  return rows.map((r) => ({ name: r.name, portion: r.portion, grams: r.grams, nutrients: nutrientsOf(r) }));
}

/** Search, then favourites first, then foods before meals, then A to Z. */
export function sortMyFoods(list: CustomFood[], query = ""): CustomFood[] {
  const q = query.trim().toLowerCase();
  const hit = (c: CustomFood) => !q || c.name.toLowerCase().includes(q) || (c.items ?? []).some((i) => i.name.toLowerCase().includes(q));
  return list.filter(hit).sort((a, b) =>
    Number(b.favorite) - Number(a.favorite) ||
    (a.kind === b.kind ? 0 : a.kind === "food" ? -1 : 1) ||
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
}

/** Last `limit` distinct foods (by name, case-insensitive), most recent first. Later days and later rows win. */
export function recentFoods(food: FoodLog[], limit = 12, query = ""): FoodLog[] {
  const q = query.trim().toLowerCase();
  const ordered = food.map((f, i) => ({ f, i })).sort((a, b) => b.f.day.localeCompare(a.f.day) || b.i - a.i);
  const seen = new Set<string>();
  const out: FoodLog[] = [];
  for (const { f } of ordered) {
    const key = f.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    if (q && !key.includes(q)) continue;
    out.push(f);
    if (out.length >= limit) break;
  }
  return out;
}

/** The same row, ready to log again (no id; day left for the caller). */
export function relog(row: FoodLog, meal?: Meal): Omit<FoodLog, "id" | "day"> {
  return { meal: meal ?? row.meal, name: row.name, portion: row.portion, grams: row.grams, source: row.source, ...nutrientsOf(row) };
}

export interface CustomFoodInput {
  name: string; portion: string; grams: string; kcal: string;
  proteinG: string; carbsG: string; fatG: string; fiberG: string; sugarG: string;
}
export type CustomFoodErrors = Partial<Record<keyof CustomFoodInput, string>>;

const MAX: Partial<Record<keyof CustomFoodInput, number>> = { grams: 5000, kcal: 5000, proteinG: 500, carbsG: 1000, fatG: 500, fiberG: 200, sugarG: 1000 };
const REQUIRED: (keyof CustomFoodInput)[] = ["kcal", "proteinG", "carbsG", "fatG"];

/** Validates the hand-made food form. Empty optional fields count as 0. */
export function validateCustomFood(v: CustomFoodInput): { errors: CustomFoodErrors; value: Omit<CustomFood, "id" | "favorite" | "kind" | "items"> | null } {
  const errors: CustomFoodErrors = {};
  const name = v.name.trim();
  if (!name) errors.name = "Give it a name.";
  else if (name.length > 80) errors.name = "Keep the name under 80 characters.";
  const nums: Partial<Record<keyof CustomFoodInput, number>> = {};
  for (const k of ["grams", "kcal", "proteinG", "carbsG", "fatG", "fiberG", "sugarG"] as const) {
    const raw = v[k].trim();
    if (!raw) {
      if (REQUIRED.includes(k)) errors[k] = k === "kcal" ? "Enter the calories." : "Enter a number, 0 is fine.";
      nums[k] = 0;
      continue;
    }
    const n = Number(raw.replace(",", "."));
    if (!Number.isFinite(n)) errors[k] = "Use a number.";
    else if (n < 0) errors[k] = "Can't be negative.";
    else if (n > (MAX[k] ?? Infinity)) errors[k] = k === "kcal" ? "Calories must be 0 to 5000." : `Must be ${MAX[k]} or less.`;
    nums[k] = n;
  }
  if (Object.keys(errors).length) return { errors, value: null };
  const grams = Math.round(nums.grams ?? 0);
  const portion = v.portion.trim() || (grams > 0 ? `${grams} g` : "1 serving");
  return {
    errors,
    value: {
      name, portion, grams,
      nutrients: { ...ZERO, kcal: Math.round(nums.kcal ?? 0), proteinG: round1(nums.proteinG ?? 0), carbsG: round1(nums.carbsG ?? 0), fatG: round1(nums.fatG ?? 0), fiberG: round1(nums.fiberG ?? 0), sugarG: round1(nums.sugarG ?? 0) },
    },
  };
}

export function customFoodToInput(cf?: CustomFood | null): CustomFoodInput {
  if (!cf) return { name: "", portion: "", grams: "", kcal: "", proteinG: "", carbsG: "", fatG: "", fiberG: "", sugarG: "" };
  const s = (n: number) => String(n ?? 0);
  return {
    name: cf.name, portion: cf.portion, grams: cf.grams ? s(cf.grams) : "", kcal: s(cf.nutrients.kcal),
    proteinG: s(cf.nutrients.proteinG), carbsG: s(cf.nutrients.carbsG), fatG: s(cf.nutrients.fatG),
    fiberG: s(cf.nutrients.fiberG), sugarG: s(cf.nutrients.sugarG),
  };
}

/** Local YYYY-MM-DD shifted by whole days (DST-safe). */
export function shiftDay(day: string, by: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, m - 1, d + by);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

/** Earliest day the user may log to (`back` days before today, inclusive window). */
export const oldestLogDay = (today: string, back = 29) => shiftDay(today, -back);

/** Keeps a picked day inside [today - back, today]; anything invalid falls back to today. */
export function clampLogDay(day: string, today: string, back = 29): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return today;
  if (day > today) return today;
  const min = oldestLogDay(today, back);
  return day < min ? min : day;
}

/** "Today", "Yesterday" or e.g. "Fri 17 Oct". */
export function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === shiftDay(today, -1)) return "Yesterday";
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}
