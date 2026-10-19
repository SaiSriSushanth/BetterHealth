import type { SupabaseClient } from "@supabase/supabase-js";
import type { CustomFood, FoodLog, Nutrients, Profile, WeightLog, WorkoutLog } from "@/lib/types";
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
const pickNutrients = (f: Nutrients): Nutrients =>
  Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, f[k]])) as unknown as Nutrients;

type CustomRow = {
  id: string; name: string; portion: string; grams: number; nutrients: Nutrients;
  favorite: boolean; kind: CustomFood["kind"]; items: CustomFood["items"] | null;
};
const toCustom = (r: CustomRow): CustomFood => ({
  id: r.id, name: r.name, portion: r.portion, grams: Number(r.grams), nutrients: r.nutrients,
  favorite: r.favorite, kind: r.kind, items: r.items ?? undefined,
});

/** Only the last 90 local days load, which keeps responses well under the 1000-row API cap. */
const since = () => {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** Weight history is small, so it loads for a full year. */
const sinceYear = () => {
  const d = new Date();
  d.setDate(d.getDate() - 366);
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
      const { data, error } = await sb.from("food_logs")
        .insert({ user_id: userId, day: f.day, meal: f.meal, name: f.name, portion: f.portion, grams: f.grams, source: f.source, nutrients: pickNutrients(f) })
        .select().single();
      fail(error);
      return toFood(data as FoodRow);
    },
    async updateFood(id, patch) {
      const row: Record<string, unknown> = {};
      if (patch.meal !== undefined) row.meal = patch.meal;
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.portion !== undefined) row.portion = patch.portion;
      if (patch.grams !== undefined) row.grams = patch.grams;
      if (patch.source !== undefined) row.source = patch.source;
      if (NUTRIENT_KEYS.some((k) => patch[k] !== undefined)) {
        const { data: cur, error: e1 } = await sb.from("food_logs").select("nutrients").eq("id", id).single();
        fail(e1);
        row.nutrients = { ...(cur!.nutrients as Nutrients), ...Object.fromEntries(NUTRIENT_KEYS.filter((k) => patch[k] !== undefined).map((k) => [k, patch[k]])) };
      }
      const { data, error } = await sb.from("food_logs").update(row).eq("id", id).select().single();
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
    async updateWorkout(id, patch) {
      const row: Record<string, unknown> = {};
      if (patch.title !== undefined) row.title = patch.title;
      if (patch.entries !== undefined) row.entries = patch.entries;
      if (patch.day !== undefined) row.day = patch.day;
      const { data, error } = await sb.from("workout_logs").update(row).eq("id", id).select().single();
      fail(error);
      return data as WorkoutLog;
    },
    async deleteWorkout(id) {
      const { error } = await sb.from("workout_logs").delete().eq("id", id);
      fail(error);
    },

    async listWeights() {
      const { data, error } = await sb.from("weight_logs").select("id,day,kg").gte("day", sinceYear()).order("day");
      fail(error);
      return ((data ?? []) as { id: string; day: string; kg: number }[]).map((r) => ({ id: r.id, day: r.day, kg: Number(r.kg) }));
    },
    async setWeight(day, kg) {
      const { data, error } = await sb.from("weight_logs")
        .upsert({ user_id: userId, day, kg }, { onConflict: "user_id,day" })
        .select("id,day,kg").single();
      fail(error);
      const r = data as { id: string; day: string; kg: number };
      return { id: r.id, day: r.day, kg: Number(r.kg) } as WeightLog;
    },
    async deleteWeight(id) {
      const { error } = await sb.from("weight_logs").delete().eq("id", id);
      fail(error);
    },

    async listCustomFoods() {
      const { data, error } = await sb.from("custom_foods").select("*").order("created_at");
      fail(error);
      return ((data ?? []) as CustomRow[]).map(toCustom);
    },
    async addCustomFood(f) {
      const { data, error } = await sb.from("custom_foods")
        .insert({ user_id: userId, name: f.name, portion: f.portion, grams: f.grams, nutrients: pickNutrients(f.nutrients), favorite: f.favorite, kind: f.kind, items: f.items ?? null })
        .select().single();
      fail(error);
      return toCustom(data as CustomRow);
    },
    async updateCustomFood(id, patch) {
      const row: Record<string, unknown> = {};
      if (patch.name !== undefined) row.name = patch.name;
      if (patch.portion !== undefined) row.portion = patch.portion;
      if (patch.grams !== undefined) row.grams = patch.grams;
      if (patch.nutrients !== undefined) row.nutrients = pickNutrients(patch.nutrients);
      if (patch.favorite !== undefined) row.favorite = patch.favorite;
      if (patch.kind !== undefined) row.kind = patch.kind;
      if (patch.items !== undefined) row.items = patch.items;
      const { data, error } = await sb.from("custom_foods").update(row).eq("id", id).select().single();
      fail(error);
      return toCustom(data as CustomRow);
    },
    async deleteCustomFood(id) {
      const { error } = await sb.from("custom_foods").delete().eq("id", id);
      fail(error);
    },
  };
}
