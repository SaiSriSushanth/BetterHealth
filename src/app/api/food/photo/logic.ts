import { z } from "zod";
import { LocaleIn } from "../../../../lib/grounding/locale";
import type { GroundedItem } from "../../../../lib/grounding/types";
import { macrosAreConsistent, type EstimatedItem } from "../../../../lib/nutrition/estimate";

/** Pure parts of the photo route: request body, sanity checks and response mapping. */

export const MAX_HINT = 140;

export const makeBody = (maxB64: number) =>
  z.object({
    image: z.string().max(maxB64),
    locale: LocaleIn.optional().catch(undefined),
    hint: z.string().max(2000).optional().catch(undefined),
  });

const BOOZY = /wine|beer|whisk|vodka|rum\b|gin\b|cocktail|liquor|alcohol|cider|sake|tequila|champagne|prosecco/i;

/** Strict check for model-sourced numbers. Alcohol carries 7 kcal/g that 4P+4C+9F cannot explain, so it is skipped. */
export function itemsLookSane(items: EstimatedItem[]): boolean {
  return items.every((i) => BOOZY.test(i.name) || macrosAreConsistent(i.nutrients, 0.2));
}

/**
 * Looser check for database-grounded items. Their macros come from real tables so the 20% kcal rule does not
 * apply, but the numbers must still be physically possible for the portion.
 */
export function groundedLooksSane(i: EstimatedItem): boolean {
  const n = i.nutrients;
  const g = i.grams;
  if (!(g >= 1 && g <= 5000)) return false;
  const vals = Object.values(n);
  if (vals.some((v) => !Number.isFinite(v) || v < 0)) return false;
  const macroMass = n.proteinG + n.carbsG + n.fatG;
  if (macroMass > g * 1.05 + 1) return false;
  if (n.kcal > g * 9.5 + 20) return false; // more than pure fat
  if (n.kcal > 6000) return false;
  return true;
}

export function allItemsLookSane(items: GroundedItem[]): boolean {
  return items.every((i) => (i.ref.source === "ai" ? itemsLookSane([i]) : groundedLooksSane(i)));
}

/** Backwards-compatible response item. */
export function toResponseItem(i: GroundedItem) {
  return {
    name: i.name, portion: i.portion, grams: i.grams, nutrients: i.nutrients,
    ref: { source: i.ref.source, name: i.ref.name, ...(i.ref.score !== undefined ? { score: i.ref.score } : {}) },
  };
}
