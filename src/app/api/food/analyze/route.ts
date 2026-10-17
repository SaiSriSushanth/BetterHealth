import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, charge, cleanInput, structured, MODEL } from "@/lib/ai/openai";
import { macrosAreConsistent, normalize } from "@/lib/nutrition/estimate";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Nutrients } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({ query: z.string().min(1).max(400) });

const num = { type: "number" } as const;
const itemProps = {
  name: { type: "string" }, portion: { type: "string" }, grams: num, kcal: num,
  protein_g: num, carbs_g: num, fat_g: num, fiber_g: num, sugar_g: num,
  sodium_mg: num, potassium_mg: num, calcium_mg: num, iron_mg: num, vitc_mg: num,
};
const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items", "confidence"],
  properties: {
    items: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: Object.keys(itemProps), properties: itemProps },
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
};
const n0 = z.number().min(0).max(20000);
const Out = z.object({
  items: z.array(z.object({
    name: z.string().max(120), portion: z.string().max(80), grams: n0.max(5000), kcal: n0.max(5000),
    protein_g: n0, carbs_g: n0, fat_g: n0, fiber_g: n0, sugar_g: n0,
    sodium_mg: n0, potassium_mg: n0, calcium_mg: n0, iron_mg: n0, vitc_mg: n0,
  })).min(1).max(12),
  confidence: z.enum(["high", "medium", "low"]),
});

const SYSTEM = `You are a nutrition estimator. Given a description of food eaten, split it into items and estimate the portion in grams and nutrition for the whole portion described (not per 100 g). Use typical values from standard food composition data. If a quantity is missing assume one common serving. kcal must be consistent with 4*protein + 4*carbs + 9*fat. Set confidence to low if the food is vague or unusual. Output only the JSON.`;

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Describe a food, up to 400 characters." }, { status: 400 });
  const query = cleanInput(parsed.data.query, 200);
  if (!query) return NextResponse.json({ error: "Describe a food, up to 400 characters." }, { status: 400 });
  const key = normalize(query);

  const a = await authenticate();
  if (!a.ok) return NextResponse.json({ error: a.error, degraded: a.degraded ?? false }, { status: a.status });

  const admin = getSupabaseAdmin();
  if (admin) {
    const { data } = await admin.from("food_cache").select("result,hits").eq("query_key", key).maybeSingle();
    if (data) {
      void admin.from("food_cache").update({ hits: data.hits + 1 }).eq("query_key", key);
      return NextResponse.json({ ...(data.result as object), cached: true });
    }
  }
  const g = await charge(a.userId, "food");
  if (!g.ok) return NextResponse.json({ error: g.error, degraded: g.degraded ?? false }, { status: g.status });

  try {
    const out = await structured({ system: SYSTEM, user: query, name: "food_nutrition", schema: Out, jsonSchema, maxTokens: 700 });
    const items = out.items.map((i) => {
      const nutrients: Nutrients = {
        kcal: Math.round(i.kcal), proteinG: i.protein_g, carbsG: i.carbs_g, fatG: i.fat_g, fiberG: i.fiber_g,
        sugarG: i.sugar_g, sodiumMg: i.sodium_mg, potassiumMg: i.potassium_mg, calciumMg: i.calcium_mg,
        ironMg: i.iron_mg, vitCMg: i.vitc_mg,
      };
      return { name: i.name, portion: i.portion, grams: Math.round(i.grams), nutrients };
    });
    const boozy = /wine|beer|whisk|vodka|rum\b|gin\b|cocktail|liquor|alcohol|cider/i.test(query);
    if (!boozy && !items.every((i) => macrosAreConsistent(i.nutrients, 0.2))) {
      return NextResponse.json({ error: "The estimate looked off, so we threw it away. Try describing the portion more precisely.", degraded: true }, { status: 200 });
    }
    const result = { items, confidence: out.confidence, source: "ai" as const };
    if (admin) await admin.from("food_cache").upsert({ query_key: key, result, model: MODEL });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "AI could not estimate that right now. Add it by hand instead.", degraded: true }, { status: 200 });
  }
}
