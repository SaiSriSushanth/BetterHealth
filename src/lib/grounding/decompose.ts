import { cleanInput, structured } from "../ai/openai";
import { DecomposeOut as Out, decomposeJsonSchema as schema, decomposeSystem as system } from "./decomposeCore";

/** Text-only call that turns a dish name into raw ingredients. Failures resolve to null. */
export function createDecomposer(region: string, model?: string) {
  return async (name: string, grams: number): Promise<{ name: string; grams: number }[] | null> => {
    try {
      const out = await structured({
        system: system(region), user: `Dish: ${cleanInput(name, 100)}. Serving weight: ${Math.round(grams)} g.`,
        name: "dish_ingredients", schema: Out, jsonSchema: schema, maxTokens: 400, temperature: 0, model, timeoutMs: 8000,
      });
      const ings = out.ingredients.filter((i) => i.grams > 0 && i.name.trim());
      return ings.length ? ings : null;
    } catch {
      return null;
    }
  };
}
