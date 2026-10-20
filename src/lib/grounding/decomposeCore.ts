import { z } from "zod";
import { cuisineContext } from "./locale";

const str = { type: "string" } as const;
const num = { type: "number" } as const;
export const decomposeJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["ingredients"],
  properties: {
    ingredients: {
      type: "array",
      items: { type: "object", additionalProperties: false, required: ["name", "grams"], properties: { name: str, grams: num } },
    },
  },
};
export const DecomposeOut = z.object({ ingredients: z.array(z.object({ name: z.string().max(80), grams: z.number().min(0).max(5000) })).max(14) });

export const decomposeSystem = (region: string) =>
  `You break a prepared dish into its ingredients. Given a dish name and the weight of one serving in grams, list the ingredients that make that serving using plain generic English food names (for example "rice, raw", "toor dal", "potato", "wheat flour", "coconut", "groundnut", "onion", "oil", "sugar") with their RAW or dry weights in grams. Include cooking oil, ghee, butter, cream and sugar or jaggery that a typical recipe uses. Skip salt, water and small spice amounts. Never list the dish itself as an ingredient. ${cuisineContext(region)} Output only the JSON.`;

