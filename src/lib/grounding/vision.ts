import { z } from "zod";
import type { Nutrients } from "../types";

/** Strict-mode JSON schema + zod for the vision call. Every property is required; "empty" values stand in for optionals. */

const num = { type: "number" } as const;
const str = { type: "string" } as const;

const nutrientProps = {
  kcal: num, protein_g: num, carbs_g: num, fat_g: num, fiber_g: num, sugar_g: num,
  sodium_mg: num, potassium_mg: num, calcium_mg: num, iron_mg: num, vitc_mg: num,
};

const itemProps = {
  name: str,
  portion: str,
  search_terms: { type: "array", items: str },
  kind: { type: "string", enum: ["dish", "ingredient", "packaged", "drink"] },
  cooking: str,
  container: str,
  grams: num,
  grams_basis: str,
  ingredients: {
    type: "array",
    description: "For kind=dish: every ingredient with RAW/dry grams, including cooking fat and sugar. Empty for other kinds.",
    items: { type: "object", additionalProperties: false, required: ["name", "grams"], properties: { name: str, grams: num } },
  },
  fallback_nutrients: { type: "object", additionalProperties: false, required: Object.keys(nutrientProps), properties: nutrientProps },
};

export const visionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items", "confidence"],
  properties: {
    items: { type: "array", items: { type: "object", additionalProperties: false, required: Object.keys(itemProps), properties: itemProps } },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
};

const n0 = z.number().min(0).max(20000);
const text = (max: number) => z.string().max(max);

export const FallbackNutrients = z.object({
  kcal: n0.max(5000), protein_g: n0, carbs_g: n0, fat_g: n0, fiber_g: n0, sugar_g: n0,
  sodium_mg: n0, potassium_mg: n0, calcium_mg: n0, iron_mg: n0, vitc_mg: n0,
});

export const VisionItem = z.object({
  name: text(120),
  portion: text(80),
  search_terms: z.array(text(80)).max(5),
  kind: z.enum(["dish", "ingredient", "packaged", "drink"]),
  cooking: text(80),
  container: text(80),
  grams: n0.max(5000),
  grams_basis: text(300),
  ingredients: z.array(z.object({ name: text(80), grams: n0.max(5000) })).max(14),
  fallback_nutrients: FallbackNutrients,
});
export type VisionItem = z.infer<typeof VisionItem>;

export const VisionOut = z.object({
  items: z.array(VisionItem).max(12),
  confidence: z.enum(["high", "medium", "low"]),
});
export type VisionOut = z.infer<typeof VisionOut>;

const r1 = (n: number) => Math.round(n * 10) / 10;

export function fallbackToNutrients(f: z.infer<typeof FallbackNutrients>): Nutrients {
  return {
    kcal: Math.round(f.kcal), proteinG: r1(f.protein_g), carbsG: r1(f.carbs_g), fatG: r1(f.fat_g), fiberG: r1(f.fiber_g),
    sugarG: r1(f.sugar_g), sodiumMg: Math.round(f.sodium_mg), potassiumMg: Math.round(f.potassium_mg),
    calciumMg: Math.round(f.calcium_mg), ironMg: r1(f.iron_mg), vitCMg: r1(f.vitc_mg),
  };
}
