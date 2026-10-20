import { describe, expect, it, vi } from "vitest";
import { resolveLocale } from "./locale";
import { groundItems, portionImplausible } from "./ground";
import { gateLabels, headOk, lexicalGate, MAX_WEB_PER_REQUEST } from "./common";
import type { FoodEntry } from "../types";
import { VisionOut, visionJsonSchema, type VisionItem } from "./vision";
import { createWebLookup, validateWebResult, webCode } from "./web";
import type { RefFood } from "./types";
import { ZERO } from "../nutrition/estimate";

const fb = (kcal: number, p: number, c: number, f: number) => ({
  kcal, protein_g: p, carbs_g: c, fat_g: f, fiber_g: 0, sugar_g: 0, sodium_mg: 0, potassium_mg: 0, calcium_mg: 0, iron_mg: 0, vitc_mg: 0,
});

const vi_ = (o: Partial<VisionItem> = {}): VisionItem => ({
  name: "ragi mudde", portion: "1 ball", search_terms: ["ragi mudde", "ragi ball"], kind: "ingredient", cooking: "", container: "",
  grams: 200, grams_basis: "plate", ingredients: [], fallback_nutrients: fb(250, 5, 52, 1), ...o,
});

const row = (o: Partial<RefFood> & { kcal?: number } = {}): RefFood => ({
  id: "ifct:A1", source: "ifct", name: "Ragi ball", aliases: [], region: "IN", category: "", state: "cooked",
  per100: { ...ZERO, kcal: o.kcal ?? 125, proteinG: 2.5, carbsG: 26, fatG: 0.5 }, portions: [], score: 0.95, ...o,
});

const none = async () => [] as RefFood[];

describe("resolveLocale", () => {
  it("detects India from region, tz or lang", () => {
    expect(resolveLocale({ region: "IN" }).region).toBe("IN");
    expect(resolveLocale({ tz: "Asia/Kolkata" }).region).toBe("IN");
    expect(resolveLocale({ tz: "Asia/Calcutta" }).region).toBe("IN");
    expect(resolveLocale({ lang: "hi-IN" }).region).toBe("IN");
    expect(resolveLocale({ region: "in" }).searchRegions).toEqual(["IN"]);
  });
  it("maps other ISO regions and falls back to GLOBAL", () => {
    expect(resolveLocale({ region: "US" })).toMatchObject({ region: "US", searchRegions: ["US", "GLOBAL"] });
    expect(resolveLocale({ region: "gb" }).region).toBe("GB");
    expect(resolveLocale({ lang: "en-AU" }).region).toBe("AU");
    expect(resolveLocale({ region: "India" }).region).toBe("GLOBAL");
    expect(resolveLocale({ lang: "en", tz: "Europe/Paris" }).region).toBe("GLOBAL");
    expect(resolveLocale(undefined).region).toBe("GLOBAL");
  });
});

describe("vision schema", () => {
  const good = { items: [vi_()], confidence: "medium" };
  it("parses valid output and keeps the strict-mode shape", () => {
    expect(VisionOut.safeParse(good).success).toBe(true);
    const item = (visionJsonSchema.properties.items.items as { required: string[]; additionalProperties: boolean });
    expect(item.additionalProperties).toBe(false);
    expect(item.required).toEqual(expect.arrayContaining(["search_terms", "ingredients", "fallback_nutrients", "grams_basis"]));
  });
  it("rejects bad kinds, negative grams and missing fields", () => {
    expect(VisionOut.safeParse({ ...good, items: [{ ...vi_(), kind: "soup" }] }).success).toBe(false);
    expect(VisionOut.safeParse({ ...good, items: [{ ...vi_(), grams: -1 }] }).success).toBe(false);
    expect(VisionOut.safeParse({ ...good, items: [{ ...vi_(), search_terms: undefined }] }).success).toBe(false);
  });
});

describe("groundItems stages", () => {
  it("stage a: built-in table wins and scales by grams", async () => {
    const search = vi.fn(none);
    const r = await groundItems([vi_({ name: "steamed rice", search_terms: ["rice, cooked"], grams: 200, fallback_nutrients: fb(260, 5, 56, 1) })], "high", { regions: ["IN"], search });
    expect(r.items[0].ref.source).toBe("table");
    expect(r.items[0].nutrients.kcal).toBe(260);
    expect(search).not.toHaveBeenCalled();
    expect(r.confidence).toBe("high");
  });

  it("table does not collapse a specific dish onto a generic row", async () => {
    const r = await groundItems([vi_({ name: "paneer butter masala", search_terms: ["paneer butter masala"], grams: 200, fallback_nutrients: fb(300, 10, 10, 24) })], "high", { regions: ["IN"], search: none });
    expect(r.items[0].ref.source).toBe("ai");
  });

  it("stage b: DB row above threshold, scaled; name stays the model's", async () => {
    const r = await groundItems([vi_()], "high", { regions: ["IN"], search: async () => [row()] });
    expect(r.items[0]).toMatchObject({ name: "ragi mudde", grams: 200, ref: { source: "ifct", name: "Ragi ball", score: 0.95 } });
    expect(r.items[0].nutrients.kcal).toBe(250);
  });

  it("stage b: below-threshold rows are ignored", async () => {
    const r = await groundItems([vi_()], "high", { regions: ["IN"], search: async () => [row({ score: 0.6 })] });
    expect(r.items[0].ref.source).toBe("ai");
  });

  it("stage b: density sanity rejects an implausible row and lowers confidence", async () => {
    // model says 125 kcal/100g; the row says 520 (>2.5x)
    const r = await groundItems([vi_()], "high", { regions: ["IN"], search: async () => [row({ kcal: 520 })] });
    expect(r.items[0].ref.source).toBe("ai");
    expect(r.items[0].nutrients.kcal).toBe(250);
    expect(r.confidence).toBe("low"); // ai + density rejection
  });

  it("stage b: picks the best acceptable row, skipping a higher-scoring insane one", async () => {
    const rows = [row({ id: "usda:1", source: "usda_sr", name: "Ragi ball, dried", aliases: ["ragi ball"], kcal: 600, score: 1.1 }), row({ score: 0.9 })];
    const r = await groundItems([vi_()], "high", { regions: ["IN"], search: async () => rows });
    expect(r.items[0].ref.name).toBe("Ragi ball");
    expect(r.confidence).toBe("medium");
  });

  it("passes the user's regions to search and maps usda_* to usda", async () => {
    const search = vi.fn(async (...args: [string, string[]]) => { void args; return [row({ id: "usda_sr:1", source: "usda_sr", name: "Ragi ball", region: "US" })]; });
    const r = await groundItems([vi_()], "high", { regions: ["US", "GLOBAL"], search });
    expect(search.mock.calls[0][1]).toEqual(["US", "GLOBAL"]);
    expect(r.items[0].ref.source).toBe("usda");
  });

  it("flags implausible grams against DB portions without changing grams", async () => {
    expect(portionImplausible(900, [{ label: "1 cup", grams: 150 }])).toBe(true);
    expect(portionImplausible(20, [{ label: "1 cup", grams: 150 }])).toBe(true);
    expect(portionImplausible(300, [{ label: "1 cup", grams: 150 }, { label: "1 tsp", grams: 5 }])).toBe(false);
    expect(portionImplausible(300, [])).toBe(false);
    const r = await groundItems([vi_({ grams: 900, fallback_nutrients: fb(1125, 22, 234, 4) })], "high", {
      regions: ["IN"], search: async () => [row({ portions: [{ label: "1 ball", grams: 150 }] })],
    });
    expect(r.items[0].grams).toBe(900);
    expect(r.confidence).toBe("medium");
  });

  describe("stage c: recipe", () => {
    const dish = (ings: { name: string; grams: number }[]) =>
      vi_({ name: "veg pulao", kind: "dish", search_terms: ["veg pulao"], grams: 300, ingredients: ings, fallback_nutrients: fb(420, 9, 70, 11) });
    const search = async (t: string) =>
      t === "rice, raw" ? [row({ id: "ifct:R", name: "Rice, raw", state: "raw", kcal: 350, score: 0.9 })]
      : t === "oil" ? [row({ id: "ifct:O", name: "Oil", state: "raw", kcal: 880, score: 0.9 })]
      : [];

    it("sums matched ingredients, ignores unmatched mass, keeps total (not per-ingredient) nutrients", async () => {
      const r = await groundItems([dish([{ name: "rice, raw", grams: 80 }, { name: "oil", grams: 10 }, { name: "garam masala", grams: 5 }])], "high", { regions: ["IN"], search });
      // 80g*3.5 + 10g*8.8 = 280 + 88 = 368 kcal, coverage 90/95
      expect(r.items[0].ref.source).toBe("recipe");
      expect(r.items[0].nutrients.kcal).toBe(368);
      expect(r.confidence).toBe("high");
    });
    it("falls through when under 70% of the mass is matched", async () => {
      const r = await groundItems([dish([{ name: "rice, raw", grams: 30 }, { name: "mystery", grams: 70 }])], "high", { regions: ["IN"], search });
      expect(r.items[0].ref.source).toBe("ai");
    });
    it("weak coverage lowers confidence", async () => {
      const r = await groundItems([dish([{ name: "rice, raw", grams: 80 }, { name: "mystery", grams: 20 }])], "high", { regions: ["IN"], search });
      expect(r.items[0].ref.source).toBe("recipe");
      expect(r.confidence).toBe("medium");
    });
  });

  describe("stage d: web", () => {
    const webRow = row({ id: "web:x", source: "web", name: "Ragi mudde", score: 1 });
    it("uses the web row when earlier stages fail", async () => {
      const web = vi.fn(async () => webRow);
      const r = await groundItems([vi_()], "high", { regions: ["IN"], search: none, web });
      expect(web).toHaveBeenCalledWith("ragi mudde");
      expect(r.items[0].ref.source).toBe("web");
      expect(r.confidence).toBe("high");
    });
    it("is not called when the DB already grounded the item", async () => {
      const web = vi.fn(async () => webRow);
      await groundItems([vi_()], "high", { regions: ["IN"], search: async () => [row()], web });
      expect(web).not.toHaveBeenCalled();
    });
    it("caps lookups at 3 per request and falls back to AI beyond that", async () => {
      const web = vi.fn(async () => webRow);
      const items = Array.from({ length: 5 }, (_, i) => vi_({ name: `food ${i}`, search_terms: [`food ${i}`] }));
      const r = await groundItems(items, "high", { regions: ["IN"], search: none, web, maxWeb: 99 });
      expect(web).toHaveBeenCalledTimes(MAX_WEB_PER_REQUEST);
      expect(r.webCalls).toBe(3);
      expect(r.items.map((i) => i.ref.source)).toEqual(["web", "web", "web", "ai", "ai"]);
    });
    it("rejects a web row that fails density sanity", async () => {
      const r = await groundItems([vi_()], "high", { regions: ["IN"], search: none, web: async () => row({ id: "web:y", source: "web", kcal: 700 }) });
      expect(r.items[0].ref.source).toBe("ai");
    });
    it("a throwing or null web lookup degrades to AI", async () => {
      const r = await groundItems([vi_()], "high", { regions: ["IN"], search: none, web: async () => { throw new Error("x"); } });
      expect(r.items[0].ref.source).toBe("ai");
    });
  });

  it("stage e: AI last resort uses fallback_nutrients and lowers confidence", async () => {
    const r = await groundItems([vi_()], "medium", { regions: ["IN"], search: none });
    expect(r.items[0].ref).toEqual({ source: "ai", name: "ragi mudde" });
    expect(r.confidence).toBe("low");
  });

  it("survives a search function that throws", async () => {
    const r = await groundItems([vi_()], "high", { regions: ["IN"], search: async () => { throw new Error("db down"); } });
    expect(r.items[0].ref.source).toBe("ai");
  });
});

describe("web lookup gating and validation", () => {
  const good = { found: true, per100: { kcal: 125, protein_g: 2.5, carbs_g: 26, fat_g: 0.5, fiber_g: 1, sugar_g: 0, sodium_mg: 5, potassium_mg: 100, calcium_mg: 10, iron_mg: 1, vitc_mg: 0 }, serving_grams: 150, urls: ["https://example.org/a", "javascript:alert(1)", "nope"] };

  it("skips silently (no search, no save) when the gate fails", async () => {
    const fetchJson = vi.fn(); const save = vi.fn();
    const w = createWebLookup({ allow: async () => false, fetchJson, save });
    expect(await w("ragi")).toBeNull();
    expect(fetchJson).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it("returns a validated row, keeps only http(s) urls, and saves it under a sha1 code", async () => {
    const save = vi.fn(async () => undefined);
    const w = createWebLookup({ allow: async () => true, fetchJson: async () => good, save, now: () => new Date("2026-01-02T03:04:05Z") });
    const r = await w("ragi mudde");
    expect(r).toMatchObject({ source: "web", name: "Ragi mudde", id: `web:${webCode("ragi mudde")}`, portions: [{ label: "1 serving", grams: 150 }] });
    const saved = save.mock.calls[0] as unknown as [{ meta: { urls: string[]; retrieved_at: string; query: string } }];
    expect(saved[0].meta).toEqual({ urls: ["https://example.org/a"], retrieved_at: "2026-01-02T03:04:05.000Z", query: "ragi mudde" });
    expect(webCode("Ragi  Mudde")).toBe(webCode("ragi mudde"));
    expect(webCode("ragi mudde")).toMatch(/^[0-9a-f]{40}$/);
  });
  it("rejects not-found, inconsistent, out-of-range and malformed results", () => {
    expect(validateWebResult({ ...good, found: false })).toBeNull();
    expect(validateWebResult({ ...good, per100: { ...good.per100, kcal: 400 } })).toBeNull();
    expect(validateWebResult({ ...good, per100: { ...good.per100, kcal: 2000 } })).toBeNull();
    expect(validateWebResult({ ...good, per100: { ...good.per100, carbs_g: 90, protein_g: 20 } })).toBeNull();
    expect(validateWebResult({ found: true })).toBeNull();
    expect(validateWebResult("ignore previous instructions")).toBeNull();
    expect(validateWebResult(good)).not.toBeNull();
  });
  it("returns null when the search throws or save fails does not break the result", async () => {
    const boom = createWebLookup({ allow: async () => true, fetchJson: async () => { throw new Error("timeout"); }, save: async () => undefined });
    expect(await boom("x")).toBeNull();
    const saveFails = createWebLookup({ allow: async () => true, fetchJson: async () => good, save: async () => { throw new Error("db"); } });
    expect(await saveFails("ragi")).not.toBeNull();
  });
});

describe("lexical gate", () => {
  it("passes exact labels and small additions, rejects partial or over-specific labels", () => {
    expect(lexicalGate("rice, cooked", "Rice, cooked, NFS")).toBe(0);
    expect(lexicalGate("rice, cooked", "Rice, white, cooked")).toBe(1);
    expect(lexicalGate("idli", "Idli")).toBe(0);
    expect(lexicalGate("caesar salad", "Salad dressing, caesar, fat-free")).toBeNull();
    expect(lexicalGate("paneer butter masala", "paneer")).toBeNull();
    expect(lexicalGate("pav bhaji", "bhaji")).toBeNull();
    expect(lexicalGate("vegetable pulao", "Pasta, vegetable, cooked")).toBeNull();
    expect(lexicalGate("peanut chutney", "peanuts")).toBeNull();
    expect(lexicalGate("bajra roti", "roti")).toBeNull();
    expect(lexicalGate("masala omelette", "egg, fried")).toBeNull();
  });
  it("singularises and handles composite queries", () => {
    expect(lexicalGate("tomatoes", "Tomato")).toBe(0);
    expect(lexicalGate("pasta with tomato sauce", "tomato pasta sauce")).toBeNull();
    expect(lexicalGate("pasta with tomato sauce", "Pasta with tomato sauce, canned")).toBe(1);
    expect(gateLabels("bhaji", ["pakora", "bhaji"])).toBe(0);
  });
});

describe("gate regressions through groundItems", () => {
  const fe = (name: string, aliases: string[], kcal: number): FoodEntry => ({
    name, aliases, per100: { ...ZERO, kcal, proteinG: kcal / 20, carbsG: kcal / 10, fatG: kcal / 40 }, serving: { label: "1", grams: 100 },
  });
  const foods = [fe("paneer", [], 296), fe("pakora", ["bhaji"], 280), fe("tomato pasta sauce", [], 80), fe("peanuts", [], 567), fe("roti", [], 297)];
  const run = (name: string, terms: string[], kind: VisionItem["kind"], rows: RefFood[] = [], kcalTotal = 300, grams = 200) =>
    groundItems([vi_({ name, search_terms: terms, kind, grams, fallback_nutrients: fb(kcalTotal, 0, 0, 0) })], "high", {
      regions: ["IN"], foods, search: async () => rows,
    });
  const r_ = (name: string, kcal: number, aliases: string[] = []) => row({ id: `usda_sr:${name}`, source: "usda_sr", name, aliases, kcal, score: 1 });

  it("paneer butter masala dish is not grounded by 'paneer'", async () => {
    const r = await run("paneer butter masala", ["paneer butter masala", "paneer"], "dish", [r_("Paneer", 296)], 500, 200);
    expect(r.items[0].ref.source).toBe("ai");
  });
  it("pav bhaji does not become pakora; a broader term cannot ground a dish", async () => {
    expect((await run("pav bhaji", ["pav bhaji", "bhaji"], "dish", [], 360, 200)).items[0].ref.source).toBe("ai");
  });
  it("vegetable pulao and caesar salad reject lookalike USDA rows", async () => {
    expect((await run("vegetable pulao", ["vegetable pulao"], "dish", [r_("Pasta, vegetable, cooked", 150)], 300, 200)).items[0].ref.source).toBe("ai");
    expect((await run("caesar salad", ["caesar salad"], "dish", [r_("Salad dressing, caesar, fat-free", 100)], 200, 200)).items[0].ref.source).toBe("ai");
  });
  it("pasta with tomato sauce is not the sauce; peanut chutney is not peanuts; bajra roti is not roti", async () => {
    expect((await run("pasta with tomato sauce", ["pasta with tomato sauce"], "dish", [], 160, 200)).items[0].ref.source).toBe("ai");
    expect((await run("peanut chutney", ["peanut chutney"], "ingredient", [], 300, 100)).items[0].ref.source).toBe("ai");
    expect((await run("bajra roti", ["bajra roti"], "ingredient", [], 120, 40)).items[0].ref.source).toBe("ai");
  });
  it("non-dish items may still use later broader terms", async () => {
    const r = await run("paneer cubes", ["paneer cubes", "paneer"], "ingredient", [], 300, 100);
    expect(r.items[0].ref).toEqual({ source: "table", name: "paneer" });
  });
  it("an acceptable DB label still wins", async () => {
    const r = await run("rice", ["rice, cooked"], "ingredient", [r_("Rice, cooked, NFS", 130)], 260, 200);
    expect(r.items[0].ref.source).toBe("usda");
  });
});

describe("headOk (USDA head-noun rule)", () => {
  it("rejects rows whose head noun is a different food", () => {
    expect(headOk("cream", "Cake, cream", "usda_fndds")).toBe(false);
    expect(headOk("caesar salad", "Salad dressing, caesar, fat-free", "usda_sr")).toBe(false);
  });
  it("accepts rows headed by the queried food", () => {
    expect(headOk("cream", "Cream, heavy", "usda_fndds")).toBe(true);
    expect(headOk("caesar salad", "Caesar salad, with romaine, no dressing", "usda_fndds")).toBe(true);
    expect(headOk("white rice, cooked", "Rice, white, long-grain, regular, cooked", "usda_sr")).toBe(true);
    expect(headOk("rice, cooked", "Rice, cooked, NFS", "usda_fndds")).toBe(true);
  });
  it("does not apply to IFCT, web or table rows", () => {
    expect(headOk("toor dal", "Red gram (toor/arhar), dal", "ifct")).toBe(true);
    expect(headOk("anything", "Whatever, else", "web")).toBe(true);
  });
});

describe("term specificity rules", () => {
  const drink = vi_({ name: "watermelon juice", kind: "drink", search_terms: ["watermelon juice", "juice", "watermelon"], grams: 250, fallback_nutrients: fb(100, 1, 24, 0) });
  const oj: FoodEntry = { name: "orange juice", aliases: ["juice"], per100: { ...ZERO, kcal: 45, carbsG: 10 }, serving: { label: "1", grams: 100 } };
  it("later terms never ground a drink or dish", async () => {
    const r = await groundItems([drink], "high", { regions: ["IN"], foods: [oj], search: none });
    expect(r.items[0].ref.source).toBe("ai");
  });
  it("terms[0] less specific than the name is ignored", async () => {
    const item = vi_({ name: "peanut chutney", kind: "dish", search_terms: ["chutney", "peanut"], grams: 50, fallback_nutrients: fb(120, 4, 6, 9) });
    const search = vi.fn(async (t: string) => (t === "chutney" ? [row({ name: "Chutney", kcal: 240, score: 1 })] : []));
    const r = await groundItems([item], "high", { regions: ["IN"], foods: [], search });
    expect(search.mock.calls.map((c) => c[0])).toEqual(["peanut chutney"]);
    expect(r.items[0].ref.source).toBe("ai");
  });
  it("ingredients may still use later broader terms", async () => {
    const item = vi_({ name: "ragi mudde", kind: "ingredient", search_terms: ["ragi mudde", "ragi ball"] });
    const r = await groundItems([item], "high", { regions: ["IN"], foods: [], search: async () => [row()] });
    expect(r.items[0].ref.source).toBe("ifct");
  });
});

describe("decomposition and recipe guards", () => {
  const dish = (o: Partial<VisionItem> = {}) =>
    vi_({ name: "ragi mudde", kind: "dish", search_terms: ["ragi mudde"], grams: 200, ingredients: [], fallback_nutrients: fb(720, 15, 150, 5), ...o });
  const search = async (t: string) =>
    t === "ragi" ? [row({ id: "ifct:R", name: "Ragi", state: "raw", kcal: 320, score: 0.9 })]
    : t === "groundnut" ? [row({ id: "ifct:Goil", name: "Groundnut oil", kcal: 900, score: 0.95 }), row({ id: "ifct:G", name: "Groundnut", state: "raw", kcal: 560, score: 0.85 })]
    : [];

  it("decomposes a dish with empty ingredients, then runs the recipe stage", async () => {
    const decompose = vi.fn(async () => [{ name: "ragi", grams: 60 }]);
    const r = await groundItems([dish()], "high", { regions: ["IN"], foods: [], search, decompose });
    expect(decompose).toHaveBeenCalledWith("ragi mudde", 200);
    expect(r.items[0].ref.source).toBe("recipe");
    expect(r.items[0].nutrients.kcal).toBe(192);
  });
  it("also decomposes when the only ingredient is the dish itself; not when ingredients are usable", async () => {
    const decompose = vi.fn(async () => [{ name: "ragi", grams: 60 }]);
    await groundItems([dish({ ingredients: [{ name: "Ragi Mudde", grams: 200 }] })], "high", { regions: ["IN"], foods: [], search, decompose });
    expect(decompose).toHaveBeenCalledTimes(1);
    decompose.mockClear();
    await groundItems([dish({ ingredients: [{ name: "ragi", grams: 60 }, { name: "water", grams: 100 }] })], "high", { regions: ["IN"], foods: [], search, decompose });
    expect(decompose).not.toHaveBeenCalled();
  });
  it("caps decompositions at 2, treats failure/timeout as null", async () => {
    const decompose = vi.fn(async () => { throw new Error("x"); });
    const items = [dish({ name: "a1", search_terms: ["a1"] }), dish({ name: "a2", search_terms: ["a2"] }), dish({ name: "a3", search_terms: ["a3"] })];
    const r = await groundItems(items, "high", { regions: ["IN"], foods: [], search, decompose });
    expect(decompose).toHaveBeenCalledTimes(2);
    expect(r.items.every((i) => i.ref.source === "ai")).toBe(true);
    const slow = vi.fn(() => new Promise<null>(() => undefined));
    const t = await groundItems([dish()], "high", { regions: ["IN"], foods: [], search, decompose: slow, decomposeTimeoutMs: 20 });
    expect(t.items[0].ref.source).toBe("ai");
  });
  it("an unmatched calorie-dense ingredient fails the recipe", async () => {
    const d = dish({ ingredients: [{ name: "ragi", grams: 100 }, { name: "ghee", grams: 10 }] });
    const r = await groundItems([d], "high", { regions: ["IN"], foods: [], search });
    expect(r.items[0].ref.source).toBe("ai");
    const ok = dish({ ingredients: [{ name: "ragi", grams: 100 }, { name: "spice mix", grams: 5 }], fallback_nutrients: fb(330, 7, 70, 2) });
    expect((await groundItems([ok], "high", { regions: ["IN"], foods: [], search })).items[0].ref.source).toBe("recipe");
  });
  it("a non-oil ingredient never matches an oil row", async () => {
    const d = dish({ ingredients: [{ name: "groundnut", grams: 20 }], fallback_nutrients: fb(120, 5, 4, 10), grams: 50 });
    const r = await groundItems([d], "high", { regions: ["IN"], foods: [], search });
    expect(r.items[0].ref).toMatchObject({ source: "recipe", name: "Groundnut" });
    expect(r.items[0].nutrients.kcal).toBe(112);
  });
});

describe("disputed recipes go to the web check", () => {
  const dish = (o: Partial<VisionItem> = {}) =>
    vi_({ name: "pav bhaji", kind: "dish", search_terms: ["pav bhaji"], grams: 250, ingredients: [{ name: "potato", grams: 100 }], fallback_nutrients: fb(600, 12, 90, 20), ...o });
  const search = async (t: string) => (t === "potato" ? [row({ id: "ifct:P", name: "Potato", state: "raw", kcal: 70, score: 0.95 })] : []);

  it("replaces a recipe that is far below the model's own estimate with a web row", async () => {
    const web = vi.fn(async () => row({ id: "web:pb", source: "web", name: "Pav bhaji", kcal: 150 }));
    const r = await groundItems([dish()], "high", { regions: ["IN"], foods: [], search, web });
    expect(web).toHaveBeenCalledTimes(1);
    expect(r.items[0].ref.source).toBe("web");
    expect(r.items[0].nutrients.kcal).toBe(375);
  });
  it("keeps the recipe, with lower confidence, when the web check finds nothing", async () => {
    const r = await groundItems([dish()], "high", { regions: ["IN"], foods: [], search, web: async () => null });
    expect(r.items[0].ref.source).toBe("recipe");
    expect(r.confidence).not.toBe("high");
  });
  it("does not spend a web call when recipe and model roughly agree", async () => {
    const web = vi.fn(async () => null);
    const agree = dish({ ingredients: [{ name: "potato", grams: 250 }], fallback_nutrients: fb(190, 4, 40, 1) });
    const r = await groundItems([agree], "high", { regions: ["IN"], foods: [], search, web });
    expect(web).not.toHaveBeenCalled();
    expect(r.items[0].ref.source).toBe("recipe");
  });
  it("serves ungrounded items before disputed recipes within the web cap", async () => {
    const web = vi.fn(async () => null);
    const open = dish({ name: "mystery", search_terms: ["mystery"], ingredients: [] });
    await groundItems([dish(), open], "high", { regions: ["IN"], foods: [], search, web, maxWeb: 1 });
    expect(web).toHaveBeenCalledWith("mystery");
  });
});

