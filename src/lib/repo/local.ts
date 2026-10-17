import type { FoodLog, Profile, WorkoutLog } from "@/lib/types";
import { type Repo, uid } from "./types";

const KEY = "betterhealth:v1";

interface Store {
  profile: Profile | null;
  food: FoodLog[];
  workouts: WorkoutLog[];
}

function read(): Store {
  const empty: Store = { profile: null, food: [], workouts: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty;
    const p = JSON.parse(raw);
    return {
      profile: p && typeof p.profile === "object" ? p.profile : null,
      food: Array.isArray(p?.food) ? p.food : [],
      workouts: Array.isArray(p?.workouts) ? p.workouts : [],
    };
  } catch {
    return empty;
  }
}

function write(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage full or blocked: keep running without persistence */
  }
}

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
  async deleteFood(id) { const s = read(); s.food = s.food.filter((x) => x.id !== id); write(s); },
  async listWorkouts() { return read().workouts; },
  async addWorkout(w) {
    const s = read();
    const row = { ...w, id: uid() };
    s.workouts.push(row);
    write(s);
    return row;
  },
  async deleteWorkout(id) { const s = read(); s.workouts = s.workouts.filter((x) => x.id !== id); write(s); },
};

/** Snapshot for the one-time "import into my account" step. */
export function readLocalSnapshot() { return read(); }
export function clearLocal() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
