/** Muscle zone ids, in the order used by the shader's uniform arrays. */
export const ZONES = [
  "neck",
  "traps",
  "shoulders",
  "chest",
  "lats",
  "lowerback",
  "abs",
  "obliques",
  "biceps",
  "triceps",
  "forearms",
  "glutes",
  "quads",
  "hamstrings",
  "adductors",
  "calves",
] as const;
export type Zone = (typeof ZONES)[number];
/** Non-muscle surface (head, hands, feet, joints). */
export const SKIN: number = ZONES.length;
export const ZONE_COUNT: number = ZONES.length + 1;
