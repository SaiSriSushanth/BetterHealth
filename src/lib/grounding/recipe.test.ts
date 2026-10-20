import { describe, expect, it } from "vitest";
import { groundRecipe } from "./recipe";
import type { RefFood } from "./types";
import { ZERO } from "../nutrition/estimate";

const ref = (name: string, kcal: number, o: Partial<RefFood> = {}): RefFood => ({
  id: `ifct:${name}`, source: "ifct", name, aliases: [], region: "IN", category: "", state: "raw",
  per100: { ...ZERO, kcal }, portions: [], score: 1, ...o,
});

/** Fake search: returns the rows registered for the query text. */
const searchOf = (table: Record<string, RefFood[]>) => async (term: string) => table[term.toLowerCase()] ?? [];

describe("groundRecipe", () => {
  it("counts water as matched mass with no nutrients and never searches for it", async () => {
    const seen: string[] = [];
    const search = async (t: string) => { seen.push(t); return t === "ragi flour" ? [ref("Ragi", 320)] : []; };
    const r = await groundRecipe({ ingredients: [{ name: "ragi flour", grams: 100 }, { name: "water", grams: 100 }] }, ["IN"], search, 0.7);
    expect(r?.total.kcal).toBe(320);
    expect(r?.coverage).toBe(1);
    expect(seen).toEqual(["ragi flour"]);
  });

  it("ignores salt and spice mixes entirely", async () => {
    const r = await groundRecipe(
      { ingredients: [{ name: "potato", grams: 100 }, { name: "salt", grams: 5 }, { name: "spices", grams: 5 }] },
      ["IN"], searchOf({ potato: [ref("Potato", 70)] }), 0.7,
    );
    expect(r?.coverage).toBe(1);
    expect(r?.total.kcal).toBe(70);
  });

  it("does not let 'ragi flour' resolve to rye flour", async () => {
    const rye = ref("Flour, rye", 340, { source: "usda_sr", score: 1.1 });
    const r = await groundRecipe({ ingredients: [{ name: "ragi flour", grams: 100 }] }, ["IN"], searchOf({ "ragi flour": [rye] }), 0.7);
    expect(r).toBeNull();
  });

  it("prefers the everyday egg over duck egg", async () => {
    const duck = ref("Egg, duck, whole, raw", 185, { score: 1.2 });
    const hen = ref("Egg, hen, whole", 155, { score: 1.1 });
    const r = await groundRecipe({ ingredients: [{ name: "egg", grams: 100 }] }, ["IN"], searchOf({ egg: [duck, hen] }), 0.7);
    expect(r?.matched[0].ref).toBe("Egg, hen, whole");
    expect(r?.total.kcal).toBe(155);
  });

  it("scales a recipe down when dry staples would outweigh the serving", async () => {
    const table = { "raw kidney beans": [ref("Rajma", 340, { aliases: ["kidney beans"] })], onion: [ref("Onion", 50)] };
    const ings = [{ name: "raw kidney beans", grams: 100 }, { name: "onion", grams: 50 }];
    // 100 g beans swell to ~240 g + 50 g onion = 290 g, served in 200 g: scale by 200/290.
    const r = await groundRecipe({ ingredients: ings }, ["IN"], searchOf(table), 0.7, 200);
    const unscaled = 340 + 25;
    expect(r!.total.kcal).toBeLessThan(unscaled * 0.75);
    expect(r!.total.kcal).toBeGreaterThan(unscaled * 0.6);
  });

  it("does not scale when the serving already fits, or when water is listed", async () => {
    const table = { rice: [ref("Rice", 350)], water: [] };
    const fits = await groundRecipe({ ingredients: [{ name: "rice", grams: 50 }] }, ["IN"], searchOf(table), 0.7, 200);
    expect(fits?.total.kcal).toBe(175);
    const withWater = await groundRecipe({ ingredients: [{ name: "rice", grams: 100 }, { name: "water", grams: 100 }] }, ["IN"], searchOf(table), 0.7, 150);
    expect(withWater?.total.kcal).toBe(350);
  });

  it("fails the recipe when a calorie-dense ingredient cannot be matched", async () => {
    const r = await groundRecipe(
      { ingredients: [{ name: "potato", grams: 100 }, { name: "ghee", grams: 10 }] }, ["IN"], searchOf({ potato: [ref("Potato", 70)] }), 0.7,
    );
    expect(r).toBeNull();
  });

  it("does not turn 'egg' into egg yolk, or 'coconut' into coconut water", async () => {
    const yolk = ref("Egg, poultry, yolk, raw", 320, { score: 1.3 });
    const whole = ref("Egg, poultry, whole", 150, { score: 1.1 });
    const e = await groundRecipe({ ingredients: [{ name: "egg", grams: 100 }] }, ["IN"], searchOf({ egg: [yolk, whole] }), 0.7);
    expect(e?.matched[0].ref).toBe("Egg, poultry, whole");
    const water = ref("Coconut water", 20, { score: 1.3 });
    const fresh = ref("Coconut, fresh", 400, { score: 1.1 });
    const c = await groundRecipe({ ingredients: [{ name: "coconut", grams: 20 }] }, ["IN"], searchOf({ coconut: [water, fresh] }), 0.7);
    expect(c?.matched[0].ref).toBe("Coconut, fresh");
  });

  it("prefers 'Ginger, fresh' over 'Mango ginger'", async () => {
    const mango = ref("Mango ginger", 60, { score: 1.2 });
    const fresh = ref("Ginger, fresh", 80, { score: 1.1 });
    const r = await groundRecipe({ ingredients: [{ name: "ginger", grams: 5 }] }, ["IN"], searchOf({ ginger: [mango, fresh] }), 0.7);
    expect(r?.matched[0].ref).toBe("Ginger, fresh");
  });

  it("converts raw weight to cooked weight when a swelling staple matches a cooked row (water counted once)", async () => {
    const cooked = ref("Beans, kidney, boiled", 120, { state: "cooked", aliases: ["kidney beans"] });
    const r = await groundRecipe({ ingredients: [{ name: "raw kidney beans", grams: 50 }] }, ["IN"], searchOf({ "raw kidney beans": [cooked] }), 0.7, 300);
    expect(r!.total.kcal).toBeGreaterThan(140); // 50 g raw ~ 120 g cooked ~ 144 kcal, not 60
    expect(r!.total.kcal).toBeLessThan(150);
  });
});
