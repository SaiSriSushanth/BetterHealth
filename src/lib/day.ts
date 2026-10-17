import type { FoodLog, Nutrients, WorkoutLog } from "./types";
import { ZERO, add } from "./nutrition/estimate";

export function totalsFor(food: FoodLog[], day: string): Nutrients {
  return food.filter((f) => f.day === day).reduce<Nutrients>((acc, f) => add(acc, f), ZERO);
}

/** Last 7 local days ending at `today`, oldest first. */
export function lastDays(today: string, n = 7): string[] {
  const [y, m, d] = today.split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const dt = new Date(y, m - 1, d - (n - 1 - i));
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  });
}

export function musclesTrained(workouts: WorkoutLog[], days: string[]): Set<string> {
  const s = new Set<string>();
  for (const w of workouts) if (days.includes(w.day)) for (const e of w.entries) s.add(e.muscleId);
  return s;
}
