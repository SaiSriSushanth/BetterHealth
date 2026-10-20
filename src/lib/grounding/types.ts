import type { EstimatedItem } from "../nutrition/estimate";
import type { Nutrients } from "../types";

/** What the client sees in `ref.source`. DB sources usda_* collapse to "usda". */
export type RefSource = "table" | "ifct" | "usda" | "recipe" | "web" | "ai";

export interface Ref {
  source: RefSource;
  name: string;
  score?: number;
}

export type DbSource = "ifct" | "usda_sr" | "usda_fndds" | "usda_foundation" | "web";

/** One row of public.reference_foods as returned by search_reference_foods(). */
export interface RefFood {
  id: string;
  source: DbSource;
  name: string;
  aliases: string[];
  region: string;
  category: string;
  state: "raw" | "cooked" | "dish" | "unknown";
  per100: Nutrients;
  portions: { label: string; grams: number }[];
  score: number;
}

export type Confidence = "high" | "medium" | "low";

export interface GroundedItem extends EstimatedItem {
  ref: Ref;
}

export interface GroundFlags {
  densityRejected: boolean;
  implausiblePortion: boolean;
  weakRecipe: boolean;
}

export const publicSource = (s: DbSource): RefSource => (s === "ifct" ? "ifct" : s === "web" ? "web" : "usda");
