import { z } from "zod";

/** Client locale hints. All optional, all untrusted: validated and clamped here. */
export const LocaleIn = z.object({
  region: z.string().max(8).optional(),
  lang: z.string().max(24).optional(),
  tz: z.string().max(64).optional(),
});
export type LocaleIn = z.infer<typeof LocaleIn>;

export interface ResolvedLocale {
  /** "IN", "US", "GB" ... or "GLOBAL" when unknown. */
  region: string;
  /** Regions passed to search_reference_foods; matching rows get a small score bonus. */
  searchRegions: string[];
}

const ISO2 = /^[A-Za-z]{2}$/;
const INDIA_TZ = new Set(["Asia/Kolkata", "Asia/Calcutta"]);

export function resolveLocale(l: LocaleIn | null | undefined): ResolvedLocale {
  const region = l?.region && ISO2.test(l.region.trim()) ? l.region.trim().toUpperCase() : "";
  const lang = l?.lang?.trim() ?? "";
  const tz = l?.tz?.trim() ?? "";
  const langRegion = /^[A-Za-z]{2,3}[-_]([A-Za-z]{2})$/.exec(lang)?.[1]?.toUpperCase() ?? "";

  let out = "GLOBAL";
  if (region === "IN" || INDIA_TZ.has(tz) || langRegion === "IN") out = "IN";
  else if (region) out = region;
  else if (langRegion) out = langRegion;

  // reference_foods.region is only IN | US | GLOBAL: Indians prefer IFCT, everyone else USDA.
  return { region: out, searchRegions: out === "IN" ? ["IN"] : ["US", "GLOBAL"] };
}

const INDIA = `The user is in India. Typical foods: idli (40-50 g each), dosa, upma, poha, roti/chapati (35-45 g, ~15-18 cm), paratha (70-90 g), rice, dal, sambar, rasam, curd, sabzi, paneer dishes, biryani, chaat. Anchors: a steel katori (small bowl) holds ~150 ml (130-180 g of food); a steel thali is 25-30 cm across; a tea cup is ~100-150 ml; a steel glass is 200-250 ml; a heaped serving spoon is ~60-80 g of cooked food. Indian home and restaurant cooking uses plenty of oil, ghee, butter and cream: assume visible gloss, a floating oil layer or a fried tadka means 1-2 tablespoons of fat per serving.`;

const GENERIC = `Judge portions with standard tableware: a dinner plate is 25-28 cm, a side plate 18-20 cm, a cereal bowl holds ~350 ml, a mug 250-350 ml, a fork is ~19 cm. Restaurant portions are usually larger than home portions. Account for cooking fat, dressings and sauces that are visible.`;

export function cuisineContext(region: string): string {
  return region === "IN" ? INDIA : GENERIC;
}
