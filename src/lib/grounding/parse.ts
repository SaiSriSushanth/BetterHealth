import { z } from "zod";
import type { Nutrients } from "../types";
import type { RefFood } from "./types";

const fin = z.coerce.number().refine(Number.isFinite).catch(0);
const Per100 = z.object({
  kcal: fin, proteinG: fin, carbsG: fin, fatG: fin, fiberG: fin, sugarG: fin,
  sodiumMg: fin, potassiumMg: fin, calciumMg: fin, ironMg: fin, vitCMg: fin,
});

const Row = z.object({
  id: z.string(),
  source: z.enum(["ifct", "usda_sr", "usda_fndds", "usda_foundation", "web"]),
  name: z.string(),
  aliases: z.array(z.string()).nullish().transform((v) => v ?? []),
  region: z.string(),
  category: z.string().nullish().transform((v) => v ?? ""),
  state: z.enum(["raw", "cooked", "dish", "unknown"]).catch("unknown"),
  per100: Per100,
  portions: z.array(z.object({ label: z.string(), grams: z.coerce.number() })).catch([]),
  score: z.coerce.number(),
});

/** Parses RPC rows defensively; malformed rows are dropped. Pure (no server-only imports) so scripts can use it. */
export function parseRefRows(data: unknown): RefFood[] {
  if (!Array.isArray(data)) return [];
  const out: RefFood[] = [];
  for (const r of data) {
    const p = Row.safeParse(r);
    if (p.success) out.push({ ...p.data, per100: p.data.per100 as Nutrients });
  }
  return out;
}
