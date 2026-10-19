import type { CustomFood, FoodLog, Profile, Targets, WeightLog, WorkoutLog } from "../../lib/types";

export interface ExportInput {
  profile: Profile | null;
  targets: Targets | null;
  food: FoodLog[];
  workouts: WorkoutLog[];
  weights: WeightLog[];
  customFoods: CustomFood[];
  storedIn: "device" | "account";
}

export function buildJsonExport(d: ExportInput, now = new Date()): string {
  return JSON.stringify({
    app: "BetterHealth", format: 1, exportedAt: now.toISOString(), storedIn: d.storedIn,
    profile: d.profile, targets: d.targets,
    food: d.food, workouts: d.workouts, weights: d.weights, customFoods: d.customFoods,
  }, null, 2);
}

const FOOD_COLUMNS = [
  "day", "meal", "name", "portion", "grams", "kcal", "proteinG", "carbsG", "fatG", "fiberG",
  "sugarG", "sodiumMg", "potassiumMg", "calciumMg", "ironMg", "vitCMg", "source",
] as const;

/** One CSV cell: quoted when needed, and text that a spreadsheet would run as a formula is neutralised. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(Math.round(v * 100) / 100) : "";
  let s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildFoodCsv(food: FoodLog[]): string {
  const rows = [...food].sort((a, b) => a.day.localeCompare(b.day));
  const lines = [FOOD_COLUMNS.join(",")];
  for (const r of rows) lines.push(FOOD_COLUMNS.map((c) => csvCell(r[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** Save text as a file through a temporary link. Call only from a click handler. */
export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
