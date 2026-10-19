import type { CustomFood, FoodLog, Profile, WeightLog, WorkoutLog } from "@/lib/types";

export interface Repo {
  kind: "local" | "cloud";
  getProfile(): Promise<Profile | null>;
  saveProfile(p: Profile): Promise<void>;
  listFood(): Promise<FoodLog[]>;
  addFood(f: Omit<FoodLog, "id">): Promise<FoodLog>;
  updateFood(id: string, patch: Partial<Omit<FoodLog, "id" | "day">>): Promise<FoodLog>;
  deleteFood(id: string): Promise<void>;
  listWorkouts(): Promise<WorkoutLog[]>;
  addWorkout(w: Omit<WorkoutLog, "id">): Promise<WorkoutLog>;
  updateWorkout(id: string, patch: Partial<Omit<WorkoutLog, "id">>): Promise<WorkoutLog>;
  deleteWorkout(id: string): Promise<void>;
  listWeights(): Promise<WeightLog[]>;
  /** one entry per day: adding for an existing day replaces it */
  setWeight(day: string, kg: number): Promise<WeightLog>;
  deleteWeight(id: string): Promise<void>;
  listCustomFoods(): Promise<CustomFood[]>;
  addCustomFood(f: Omit<CustomFood, "id">): Promise<CustomFood>;
  updateCustomFood(id: string, patch: Partial<Omit<CustomFood, "id">>): Promise<CustomFood>;
  deleteCustomFood(id: string): Promise<void>;
}

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

/** The user's local calendar day as YYYY-MM-DD (client only). */
export function localDay(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
