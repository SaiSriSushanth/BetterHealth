// Old vs new nutrient sourcing for the same foods and the same grams.
//   npx --yes tsx scripts/eval/compare.mts            (needs OPENAI_API_KEY + Supabase service key in .env.local)
//
// No photos are involved: each food is described in text, and ONE model call (the new vision schema and prompt)
// returns search terms, raw ingredients and its own nutrient guess.
//   OLD = that nutrient guess (this is what the previous photo route stored: the model's recall)
//   NEW = groundItems(): built-in table -> IFCT/USDA search -> recipe over ingredients -> (web off) -> model guess
// --offline: no OpenAI call. Search terms, ingredients and a rough kcal/100g guess below are HAND-WRITTEN stand-ins for the
// model's output, and OLD is only available for foods that were really logged (values read from Supabase food_logs).
// Same grams on both sides, so only the nutrient source differs. Web fallback only runs with --web. The dish decomposer is always on (it is part of the pipeline).
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { groundItems } from "../../src/lib/grounding/ground";
import { buildVisionSystem } from "../../src/lib/grounding/prompt";
import { fallbackToNutrients, VisionOut, visionJsonSchema } from "../../src/lib/grounding/vision";
import { parseRefRows } from "../../src/lib/grounding/parse";
import { DecomposeOut, decomposeJsonSchema, decomposeSystem } from "../../src/lib/grounding/decomposeCore";
import { createWebLookup } from "../../src/lib/grounding/web";
import { runWebSearchJson } from "../../src/lib/grounding/websearch";
import { WEB_SYSTEM, webJsonSchema } from "../../src/lib/grounding/web";

const env: Record<string, string> = { ...(process.env as Record<string, string>) };
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 40000, maxRetries: 1 });
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const MODEL = env.OPENAI_MODEL || "gpt-4o-mini";

// [description, grams, where it came from]
const FOODS: [string, number, string][] = [
  ["upma", 300, "logged"], ["coconut chutney", 30, "logged"], ["idli (4 pieces)", 200, "logged"],
  ["french fries", 110, "logged"], ["watermelon juice", 240, "logged"],
  ["plain dosa", 120, "extra"], ["masala dosa with potato filling", 200, "extra"], ["sambar", 200, "extra"],
  ["poha", 200, "extra"], ["roti", 40, "extra"], ["aloo paratha", 100, "extra"], ["dal tadka", 200, "extra"],
  ["rajma curry", 200, "extra"], ["chole", 200, "extra"], ["paneer butter masala", 200, "extra"],
  ["chicken biryani", 300, "extra"], ["vegetable pulao", 250, "extra"], ["curd rice", 250, "extra"],
  ["steamed white rice", 150, "extra"], ["aloo gobi", 150, "extra"], ["palak paneer", 200, "extra"],
  ["butter chicken", 200, "extra"], ["samosa", 100, "extra"], ["pav bhaji", 250, "extra"], ["vada pav", 150, "extra"],
  ["gulab jamun", 50, "extra"], ["jalebi", 50, "extra"], ["masala chai", 150, "extra"], ["sweet lassi", 250, "extra"],
  ["ragi mudde", 200, "extra"], ["bajra roti", 50, "extra"], ["banana", 120, "extra"], ["mango", 200, "extra"],
  ["boiled egg", 50, "extra"], ["masala omelette", 100, "extra"], ["oats porridge with milk", 250, "extra"],
  ["pasta with tomato sauce", 250, "extra"], ["cheeseburger", 150, "extra"], ["pizza slice", 110, "extra"],
  ["sushi roll", 150, "extra"], ["grilled chicken breast", 120, "extra"], ["caesar salad", 200, "extra"],
  ["toor dal, cooked", 150, "extra"], ["cooked brown rice", 150, "extra"], ["peanut chutney", 30, "extra"],
];

const search = async (term: string, regions: string[]) => {
  const { data, error } = await sb.rpc("search_reference_foods", { q: term.trim().slice(0, 100), regions, lim: 6 });
  return error ? [] : parseRefRows(data);
};


const OFFLINE = process.argv.includes("--offline");
/** Real old-pipeline results from this project's food_logs (source photo/ai): food -> kcal. */
const LOGGED_OLD: Record<string, number> = { "upma": 600, "coconut chutney": 70, "idli (4 pieces)": 220, "french fries": 330, "watermelon juice": 92 };
type Stand = { terms: string[]; kind: "dish" | "ingredient" | "packaged" | "drink"; dens: number; ing?: [string, number][] };
const STAND: Record<string, Stand> = {
  "upma": { terms: ["upma"], kind: "dish", dens: 150, ing: [["semolina", 60], ["vegetable oil", 10], ["onion", 40], ["carrot", 20]] },
  "coconut chutney": { terms: ["coconut chutney"], kind: "dish", dens: 200, ing: [["coconut, fresh", 20], ["roasted chana dal", 5], ["green chilli", 2]] },
  "idli (4 pieces)": { terms: ["idli"], kind: "dish", dens: 130 },
  "french fries": { terms: ["french fries"], kind: "dish", dens: 300 },
  "watermelon juice": { terms: ["watermelon juice", "watermelon"], kind: "drink", dens: 40 },
  "plain dosa": { terms: ["dosa"], kind: "dish", dens: 170 },
  "masala dosa with potato filling": { terms: ["masala dosa", "dosa with filling"], kind: "dish", dens: 170 },
  "sambar": { terms: ["sambar"], kind: "dish", dens: 60, ing: [["red gram dal", 30], ["drumstick", 30], ["tomato", 30], ["onion", 20], ["tamarind", 5], ["oil", 5]] },
  "poha": { terms: ["poha"], kind: "dish", dens: 130, ing: [["rice flakes", 60], ["onion", 40], ["groundnut", 10], ["oil", 8], ["potato", 30]] },
  "roti": { terms: ["roti", "chapati"], kind: "dish", dens: 290 },
  "aloo paratha": { terms: ["aloo paratha"], kind: "dish", dens: 250, ing: [["wheat flour atta", 55], ["potato", 50], ["oil", 8]] },
  "dal tadka": { terms: ["dal tadka"], kind: "dish", dens: 110, ing: [["red gram dal", 45], ["ghee", 6], ["onion", 20], ["tomato", 20]] },
  "rajma curry": { terms: ["rajma", "kidney beans curry"], kind: "dish", dens: 120, ing: [["rajma", 45], ["onion", 40], ["tomato", 40], ["oil", 8]] },
  "chole": { terms: ["chole", "chickpea curry"], kind: "dish", dens: 130, ing: [["bengal gram, whole", 50], ["onion", 40], ["tomato", 40], ["oil", 10]] },
  "paneer butter masala": { terms: ["paneer butter masala", "paneer"], kind: "dish", dens: 220, ing: [["paneer", 60], ["butter", 15], ["tomato", 70], ["cream", 15], ["onion", 30]] },
  "chicken biryani": { terms: ["chicken biryani"], kind: "dish", dens: 170 },
  "vegetable pulao": { terms: ["vegetable pulao"], kind: "dish", dens: 150, ing: [["rice, raw", 80], ["oil", 10], ["mixed vegetables", 60]] },
  "curd rice": { terms: ["curd rice"], kind: "dish", dens: 120, ing: [["rice, raw", 55], ["curd", 100], ["oil", 3]] },
  "steamed white rice": { terms: ["cooked white rice", "rice, cooked"], kind: "ingredient", dens: 130 },
  "aloo gobi": { terms: ["aloo gobi"], kind: "dish", dens: 100, ing: [["potato", 70], ["cauliflower", 70], ["oil", 10], ["onion", 20]] },
  "palak paneer": { terms: ["palak paneer", "saag paneer"], kind: "dish", dens: 150, ing: [["spinach", 90], ["paneer", 60], ["oil", 10], ["onion", 30], ["cream", 10]] },
  "butter chicken": { terms: ["butter chicken", "chicken curry"], kind: "dish", dens: 150, ing: [["chicken", 100], ["butter", 15], ["tomato", 60], ["cream", 15], ["onion", 20]] },
  "samosa": { terms: ["samosa"], kind: "dish", dens: 260 },
  "pav bhaji": { terms: ["pav bhaji"], kind: "dish", dens: 150, ing: [["potato", 80], ["mixed vegetables", 80], ["butter", 15], ["bread roll", 80]] },
  "vada pav": { terms: ["vada pav"], kind: "dish", dens: 240, ing: [["potato", 60], ["bread roll", 50], ["gram flour besan", 20], ["oil", 15]] },
  "gulab jamun": { terms: ["gulab jamun"], kind: "dish", dens: 300 },
  "jalebi": { terms: ["jalebi"], kind: "dish", dens: 380 },
  "masala chai": { terms: ["masala chai", "tea with milk and sugar"], kind: "drink", dens: 55 },
  "sweet lassi": { terms: ["sweet lassi", "lassi"], kind: "drink", dens: 80 },
  "ragi mudde": { terms: ["ragi mudde"], kind: "dish", dens: 120, ing: [["ragi", 70]] },
  "bajra roti": { terms: ["bajra roti"], kind: "dish", dens: 260, ing: [["bajra", 45], ["oil", 3]] },
  "banana": { terms: ["banana"], kind: "ingredient", dens: 90 },
  "mango": { terms: ["mango"], kind: "ingredient", dens: 60 },
  "boiled egg": { terms: ["egg, boiled", "boiled egg"], kind: "ingredient", dens: 155 },
  "masala omelette": { terms: ["omelette", "masala omelette"], kind: "dish", dens: 190, ing: [["egg, hen", 100], ["onion", 20], ["oil", 6]] },
  "oats porridge with milk": { terms: ["oatmeal with milk", "oatmeal, cooked"], kind: "dish", dens: 80, ing: [["oats", 40], ["milk, cow", 200]] },
  "pasta with tomato sauce": { terms: ["pasta with tomato sauce"], kind: "dish", dens: 130 },
  "cheeseburger": { terms: ["cheeseburger"], kind: "dish", dens: 270 },
  "pizza slice": { terms: ["pizza, cheese"], kind: "dish", dens: 270 },
  "sushi roll": { terms: ["sushi roll"], kind: "dish", dens: 150 },
  "grilled chicken breast": { terms: ["chicken breast, cooked"], kind: "ingredient", dens: 165 },
  "caesar salad": { terms: ["caesar salad"], kind: "dish", dens: 120 },
  "toor dal, cooked": { terms: ["toor dal, cooked", "dal, cooked"], kind: "ingredient", dens: 110 },
  "cooked brown rice": { terms: ["brown rice, cooked"], kind: "ingredient", dens: 125 },
  "peanut chutney": { terms: ["peanut chutney"], kind: "dish", dens: 350, ing: [["groundnut", 20], ["chilli", 2], ["garlic", 2]] },
};

const WITH_WEB = process.argv.includes("--web");
const decompose = async (name: string, grams: number) => {
  try {
    const res = await openai.chat.completions.create({
      model: MODEL, temperature: 0, max_tokens: 400,
      messages: [{ role: "system", content: decomposeSystem("IN") }, { role: "user", content: `Dish: ${name}. Serving weight: ${Math.round(grams)} g.` }],
      response_format: { type: "json_schema", json_schema: { name: "dish_ingredients", strict: true, schema: decomposeJsonSchema } },
    });
    const out = DecomposeOut.parse(JSON.parse(res.choices[0].message.content ?? "{}"));
    const ings = out.ingredients.filter((i) => i.grams > 0 && i.name.trim());
    return ings.length ? ings : null;
  } catch { return null; }
};
// Same lookup the route uses, minus auth/charge/Supabase writes.
const web = createWebLookup({
  allow: async () => true,
  save: async () => undefined,
  fetchJson: (q) => runWebSearchJson(openai, MODEL, { system: WEB_SYSTEM, query: q, name: "food_per_100g", jsonSchema: webJsonSchema, timeoutMs: 20000 }),
});

async function oneFood([desc, grams]: [string, number, string]) {
  if (OFFLINE) {
    const st = STAND[desc];
    const z = { kcal: Math.round(st.dens * grams / 100), protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0, sodium_mg: 0, potassium_mg: 0, calcium_mg: 0, iron_mg: 0, vitc_mg: 0 };
    const item = { name: desc, portion: `${grams} g`, search_terms: st.terms, kind: st.kind, cooking: "", container: "", grams, grams_basis: "", ingredients: (st.ing ?? []).map(([name, g]) => ({ name, grams: g })), fallback_nutrients: z };
    const g = await groundItems([item], "medium", { regions: ["IN"], search });
    const oldKcal = LOGGED_OLD[desc];
    return { desc, grams, kind: item.kind, terms: item.search_terms, ingredients: item.ingredients.map((i) => `${i.name} ${i.grams}g`), old: { ...fallbackToNutrients(z), kcal: oldKcal ?? NaN }, neu: g.items[0].nutrients, ref: g.items[0].ref, confidence: g.confidence };
  }
  const res = await openai.chat.completions.create({
    model: MODEL, temperature: 0, max_tokens: 900,
    messages: [
      { role: "system", content: buildVisionSystem("IN") },
      { role: "user", content: `No photo available. The meal is: ${desc}, about ${grams} g. Return exactly one item for it, with grams = ${grams}.` },
    ],
    response_format: { type: "json_schema", json_schema: { name: "photo_nutrition", strict: true, schema: visionJsonSchema } },
  });
  const out = VisionOut.parse(JSON.parse(res.choices[0].message.content ?? "{}"));
  const item = { ...out.items[0], grams };
  const old = fallbackToNutrients(item.fallback_nutrients);
  const g = await groundItems([item], out.confidence, { regions: ["IN"], search, decompose, ...(WITH_WEB ? { web } : {}) });
  return { desc, grams, kind: item.kind, terms: item.search_terms, ingredients: item.ingredients.map((i) => `${i.name} ${i.grams}g`), old, neu: g.items[0].nutrients, ref: g.items[0].ref, confidence: g.confidence };
}

const rows: Awaited<ReturnType<typeof oneFood>>[] = [];
const queue = [...FOODS];
await Promise.all(Array.from({ length: 5 }, async () => {
  for (let f = queue.shift(); f; f = queue.shift()) {
    try { rows.push(await oneFood(f)); } catch (e) { console.error("failed:", f[0], (e as Error).message.slice(0, 80)); }
  }
}));
const order = new Map(FOODS.map((f, i) => [f[0], i]));
rows.sort((a, b) => order.get(a.desc)! - order.get(b.desc)!);

const pct = (o: number, n: number) => (o > 0 && Number.isFinite(o) ? Math.round(((n - o) / o) * 100) : 0);
const lines = [
  `| Food | g | Old kcal | New kcal | Δ | Old P/C/F | New P/C/F | Grounded in |`,
  `|---|---:|---:|---:|---:|---|---|---|`,
  ...rows.map((r) => `| ${r.desc} | ${r.grams} | ${Number.isFinite(r.old.kcal) ? r.old.kcal : "n/a"} | ${r.neu.kcal} | ${Number.isFinite(r.old.kcal) ? pct(r.old.kcal, r.neu.kcal) + "%" : ""} | ${OFFLINE ? "" : `${r.old.proteinG}/${r.old.carbsG}/${r.old.fatG}`} | ${r.neu.proteinG}/${r.neu.carbsG}/${r.neu.fatG} | ${r.ref.source}: ${r.ref.name} |`),
];
const by: Record<string, number> = {};
for (const r of rows) by[r.ref.source] = (by[r.ref.source] ?? 0) + 1;
const big = rows.filter((r) => Number.isFinite(r.old.kcal) && Math.abs(pct(r.old.kcal, r.neu.kcal)) >= 25).length;
const summary = `Foods: ${rows.length}. Grounded in: ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(", ")}. ` +
  `Old and new differ by 25% or more on ${big}. Model: ${MODEL}.`;
console.log(lines.join("\n") + "\n\n" + summary);
writeFileSync("data/reference/compare.json", JSON.stringify(rows, null, 1));
writeFileSync("data/reference/compare.md", lines.join("\n") + "\n\n" + summary + "\n");
