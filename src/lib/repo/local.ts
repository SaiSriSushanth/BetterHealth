import type { CustomFood, FoodLog, Profile, WeightLog, WorkoutLog } from "@/lib/types";
import { type Repo, uid } from "./types";

const KEY = "betterhealth:v1";

export interface LocalStore {
  profile: Profile | null;
  food: FoodLog[];
  workouts: WorkoutLog[];
  weights: WeightLog[];
  customFoods: CustomFood[];
}

function read(): LocalStore {
  const empty: LocalStore = { profile: null, food: [], workouts: [], weights: [], customFoods: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    const p = JSON.parse(raw);
    return {
      profile: p && typeof p.profile === "object" ? p.profile : null,
      food: Array.isArray(p?.food) ? p.food : [],
      workouts: Array.isArray(p?.workouts) ? p.workouts : [],
      weights: Array.isArray(p?.weights) ? p.weights : [],
      customFoods: Array.isArray(p?.customFoods) ? p.customFoods : [],
    };
  } catch {
    return empty;
  }
}

function write(s: LocalStore) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: keep running without persistence */
  }
}

const missing = (what: string) => new Error(`${what} not found`);

export const localRepo: Repo = {
  kind: "local",
  async getProfile() { return read().profile; },
  async saveProfile(p) { const s = read(); s.profile = p; write(s); },

  async listFood() { return read().food; },
  async addFood(f) {
    const s = read();
    const row = { ...f, id: uid() };
    s.food.push(row);
    write(s);
    return row;
  },
  async updateFood(id, patch) {
    const s = read();
    const i = s.food.findIndex((x) => x.id === id);
    if (i < 0) throw missing("Food entry");
    s.food[i] = { ...s.food[i], ...patch };
    write(s);
    return s.food[i];
  },
  async deleteFood(id) { const s = read(); s.food = s.food.filter((x) => x.id !== id); write(s); },

  async listWorkouts() { return read().workouts; },
  async addWorkout(w) {
    const s = read();
    const row = { ...w, id: uid() };
    s.workouts.push(row);
    write(s);
    return row;
  },
  async updateWorkout(id, patch) {
    const s = read();
    const i = s.workouts.findIndex((x) => x.id === id);
    if (i < 0) throw missing("Workout");
    s.workouts[i] = { ...s.workouts[i], ...patch };
    write(s);
    return s.workouts[i];
  },
  async deleteWorkout(id) { const s = read(); s.workouts = s.workouts.filter((x) => x.id !== id); write(s); },

  async listWeights() { return read().weights; },
  async setWeight(day, kg) {
    const s = read();
    const i = s.weights.findIndex((x) => x.day === day);
    const row = { id: i >= 0 ? s.weights[i].id : uid(), day, kg };
    if (i >= 0) s.weights[i] = row; else s.weights.push(row);
    write(s);
    return row;
  },
  async deleteWeight(id) { const s = read(); s.weights = s.weights.filter((x) => x.id !== id); write(s); },

  async listCustomFoods() { return read().customFoods; },
  async addCustomFood(f) {
    const s = read();
    const row = { ...f, id: uid() };
    s.customFoods.push(row);
    write(s);
    return row;
  },
  async updateCustomFood(id, patch) {
    const s = read();
    const i = s.customFoods.findIndex((x) => x.id === id);
    if (i < 0) throw missing("Saved food");
    s.customFoods[i] = { ...s.customFoods[i], ...patch };
    write(s);
    return s.customFoods[i];
  },
  async deleteCustomFood(id) { const s = read(); s.customFoods = s.customFoods.filter((x) => x.id !== id); write(s); },
};

/** Snapshot for the one-time "import into my account" step. */
export function readLocalSnapshot() { return read(); }
export function clearLocal() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
