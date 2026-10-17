import type { SupabaseClient } from "@supabase/supabase-js";
import type { FoodLog, Nutrients, Profile, WorkoutLog } from "@/lib/types";
import type { Repo } from "./types";

type FoodRow = {
  id: string; day: string; meal: FoodLog["meal"]; name: string; portion: string;
  grams: number; source: FoodLog["source"]; nutrients: Nutrients;
};
const toFood = (r: FoodRow): FoodLog => ({
  id: r.id, day: r.day, meal: r.meal, name: r.name, portion: r.portion,
  grams: Number(r.grams), source: r.source, ...r.nutrients,
});
const NUTRIENT_KEYS: (keyof Nutrients)[] = [
  "kcal", "proteinG", "carbsG", "fatG", "fiberG", "sugarG",
  "sodiumMg", "potassiumMg", "calciumMg", "ironMg", "vitCMg",
];

/** Only the last 90 local days load, which keeps responses well under the 1000-row API cap. */
const since = () => {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function cloudRepo(sb: SupabaseClient, userId: string): Repo {
  const fail = (e: { message: string } | null) => { if (e) throw new Error(e.message); };
  return {
    kind: "cloud",
    async getProfile() {
      const { data, error } = await sb.from("profiles").select("data").eq("id", userId).maybeSingle();
      fail(error);
      return (data?.data as Profile | undefined) ?? null;
    },
    async saveProfile(p) {
      const { error } = await sb.from("profiles").upsert({ id: userId, data: p, updated_at: new Date().toISOString() });
      fail(error);
    },
    async listFood() {
      const { data, error } = await sb.from("food_logs").select("*").gte("day", since()).order("created_at");
      fail(error);
      return (data as FoodRow[]).map(toFood);
    },
    async addFood(f) {
      const nutrients = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, f[k]]));
      const { data, error } = await sb.from("food_logs")
        .insert({ user_id: userId, day: f.day, meal: f.meal, name: f.name, portion: f.portion, grams: f.grams, source: f.source, nutrients })
        .select().single();
      fail(error);
      return toFood(data as FoodRow);
    },
    async deleteFood(id) {
      const { error } = await sb.from("food_logs").delete().eq("id", id);
      fail(error);
    },
    async listWorkouts() {
      const { data, error } = await sb.from("workout_logs").select("*").gte("day", since()).order("created_at");
      fail(error);
      return (data ?? []) as WorkoutLog[];
    },
    async addWorkout(w) {
      const { data, error } = await sb.from("workout_logs")
        .insert({ user_id: userId, day: w.day, title: w.title, entries: w.entries })
        .select().single();
      fail(error);
      return data as WorkoutLog;
    },
    async deleteWorkout(id) {
      const { error } = await sb.from("workout_logs").delete().eq("id", id);
      fail(error);
    },
  };
}
