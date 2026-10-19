import { describe, expect, it } from "vitest";
import {
  clampLogDay, customFoodToInput, customToLog, itemsToCustomFood, logsToItems, portionOf, recentFoods, relog,
  rescaleLog, scalePortionLabel, shiftDay, sortMyFoods, sumNutrients, validateCustomFood,
} from "./foods";
import { ZERO } from "./nutrition/estimate";
import type { CustomFood, FoodLog } from "./types";

const n = (kcal: number, p = 0, c = 0, f = 0) => ({ ...ZERO, kcal, proteinG: p, carbsG: c, fatG: f, sodiumMg: kcal });
const log = (id: string, day: string, name: string, extra: Partial<FoodLog> = {}): FoodLog => ({
  id, day, name, meal: "breakfast", portion: "100 g", grams: 100, source: "table", ...n(200, 10, 20, 5), ...extra,
});
const cf = (id: string, name: string, extra: Partial<CustomFood> = {}): CustomFood => ({
  id, name, portion: "1 bowl", grams: 200, nutrients: n(300, 12, 40, 8), favorite: false, kind: "food", ...extra,
});

describe("scalePortionLabel", () => {
  it("multiplies a leading number", () => {
    expect(scalePortionLabel("2 eggs", 1.5)).toBe("3 eggs");
    expect(scalePortionLabel("1 serving", 0.5)).toBe("0.5 serving");
    expect(scalePortionLabel("100 g", 2)).toBe("200 g");
  });
  it("prefixes when there is no number, and leaves 1x alone", () => {
    expect(scalePortionLabel("toast", 2)).toBe("2 × toast");
    expect(scalePortionLabel("toast", 1)).toBe("toast");
    expect(scalePortionLabel("", 2)).toBe("2 serving");
  });
});

describe("rescaleLog", () => {
  it("scales every nutrient and grams", () => {
    const r = rescaleLog(log("a", "2026-10-19", "Oats"), 1.5);
    expect(r.kcal).toBe(300);
    expect(r.proteinG).toBe(15);
    expect(r.sodiumMg).toBe(300);
    expect(r.grams).toBe(150);
    expect(r.portion).toBe("150 g");
  });
  it("uses a gram label when grams are typed", () => {
    const r = rescaleLog(log("a", "2026-10-19", "Oats", { portion: "1 cup" }), 0.8, { grams: 80 });
    expect(r.portion).toBe("80 g");
    expect(r.grams).toBe(80);
    expect(r.kcal).toBe(160);
  });
  it("handles manual rows with no grams by scaling servings", () => {
    const r = rescaleLog(log("a", "2026-10-19", "Cake", { grams: 0, portion: "1 serving" }), 2, { grams: 50 });
    expect(r.grams).toBe(0);
    expect(r.portion).toBe("2 serving");
    expect(r.kcal).toBe(400);
  });
  it("ignores a bad factor", () => {
    expect(rescaleLog(log("a", "d", "x"), 0).kcal).toBe(200);
  });
});

describe("portionOf / customToLog", () => {
  it("scales by multiplier", () => {
    const p = portionOf(cf("1", "Dal"), { factor: 2 });
    expect(p.grams).toBe(400);
    expect(p.portion).toBe("2 bowl");
    expect(p.nutrients.kcal).toBe(600);
  });
  it("scales by grams", () => {
    const p = portionOf(cf("1", "Dal"), { grams: 100 });
    expect(p.factor).toBe(0.5);
    expect(p.portion).toBe("100 g");
    expect(p.nutrients.kcal).toBe(150);
  });
  it("builds a custom-source log", () => {
    const l = customToLog(cf("1", "Dal"), { factor: 1 }, "lunch");
    expect(l).toMatchObject({ meal: "lunch", name: "Dal", source: "custom", kcal: 300, portion: "1 bowl", grams: 200 });
  });
});

describe("itemsToCustomFood", () => {
  it("one item is a food", () => {
    const c = itemsToCustomFood([{ name: "Egg", portion: "2 piece", grams: 100, nutrients: n(140, 12, 1, 10) }], "");
    expect(c).toMatchObject({ name: "Egg", kind: "food", portion: "2 piece", grams: 100 });
    expect(c.items).toBeUndefined();
  });
  it("several items are a meal with summed nutrients", () => {
    const rows = [log("a", "d", "Egg"), log("b", "d", "Toast", { ...n(100, 3, 18, 1), grams: 40 })];
    const c = itemsToCustomFood(logsToItems(rows), "My breakfast", true);
    expect(c.kind).toBe("meal");
    expect(c.favorite).toBe(true);
    expect(c.items).toHaveLength(2);
    expect(c.nutrients.kcal).toBe(300);
    expect(c.nutrients.proteinG).toBe(13);
    expect(c.grams).toBe(140);
  });
  it("sums nutrients", () => {
    expect(sumNutrients([n(1, 1), n(2, 2)]).proteinG).toBe(3);
  });
});

describe("sortMyFoods", () => {
  const list = [cf("1", "Zucchini"), cf("2", "apple"), cf("3", "Breakfast bowl", { kind: "meal" }), cf("4", "Milk", { favorite: true })];
  it("favourites first, then foods, then meals, A to Z", () => {
    expect(sortMyFoods(list).map((c) => c.id)).toEqual(["4", "2", "1", "3"]);
  });
  it("filters by name and meal items", () => {
    expect(sortMyFoods(list, "app").map((c) => c.id)).toEqual(["2"]);
    const withItems = [...list, cf("5", "Lunch", { kind: "meal", items: [{ name: "Paneer", grams: 1, nutrients: ZERO }] })];
    expect(sortMyFoods(withItems, "paneer").map((c) => c.id)).toEqual(["5"]);
  });
  it("does not mutate the input", () => {
    sortMyFoods(list);
    expect(list[0].id).toBe("1");
  });
});

describe("recentFoods", () => {
  const food = [
    log("1", "2026-10-17", "Oats"),
    log("2", "2026-10-18", "Banana"),
    log("3", "2026-10-19", "oats", { grams: 50 }),
    log("4", "2026-10-19", "Coffee"),
  ];
  it("distinct by name, newest first", () => {
    const r = recentFoods(food);
    expect(r.map((f) => f.id)).toEqual(["4", "3", "2"]);
  });
  it("limits and filters", () => {
    expect(recentFoods(food, 1).map((f) => f.id)).toEqual(["4"]);
    expect(recentFoods(food, 12, "ban").map((f) => f.id)).toEqual(["2"]);
  });
  it("relog keeps portion and nutrients, drops id/day", () => {
    const r = relog(food[2], "dinner");
    expect(r).not.toHaveProperty("id");
    expect(r).not.toHaveProperty("day");
    expect(r).toMatchObject({ meal: "dinner", grams: 50, kcal: 200 });
  });
});

describe("validateCustomFood", () => {
  const ok = { ...customFoodToInput(null), name: "Protein bar", kcal: "210", proteinG: "20", carbsG: "22", fatG: "7" };
  it("accepts a valid food and defaults the portion", () => {
    const r = validateCustomFood({ ...ok, grams: "60" });
    expect(r.errors).toEqual({});
    expect(r.value).toMatchObject({ name: "Protein bar", portion: "60 g", grams: 60 });
    expect(r.value?.nutrients.kcal).toBe(210);
  });
  it("requires a name and calories", () => {
    const r = validateCustomFood({ ...ok, name: " ", kcal: "" });
    expect(r.value).toBeNull();
    expect(r.errors.name).toBeTruthy();
    expect(r.errors.kcal).toBeTruthy();
  });
  it("rejects negatives, non-numbers and too many calories", () => {
    const r = validateCustomFood({ ...ok, proteinG: "-1", fatG: "abc", kcal: "5001" });
    expect(r.errors.proteinG).toMatch(/negative/);
    expect(r.errors.fatG).toBeTruthy();
    expect(r.errors.kcal).toMatch(/5000/);
  });
  it("round-trips a saved food", () => {
    const c = cf("1", "Dal");
    const r = validateCustomFood(customFoodToInput(c));
    expect(r.value).toMatchObject({ name: "Dal", portion: "1 bowl", grams: 200 });
  });
});

describe("days", () => {
  it("shifts across month ends", () => {
    expect(shiftDay("2026-11-01", -1)).toBe("2026-10-31");
  });
  it("clamps to the last 30 days, never the future", () => {
    expect(clampLogDay("2026-10-20", "2026-10-19")).toBe("2026-10-19");
    expect(clampLogDay("2026-01-01", "2026-10-19")).toBe("2026-09-20");
    expect(clampLogDay("2026-10-10", "2026-10-19")).toBe("2026-10-10");
    expect(clampLogDay("nope", "2026-10-19")).toBe("2026-10-19");
  });
});
