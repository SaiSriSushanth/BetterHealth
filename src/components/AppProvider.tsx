"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CustomFood, FoodLog, Profile, Targets, WeightLog, WorkoutLog } from "@/lib/types";
import type { Repo } from "@/lib/repo/types";
import { localDay } from "@/lib/repo/types";
import { clearLocal, localRepo, readLocalSnapshot } from "@/lib/repo/local";
import { cloudRepo } from "@/lib/repo/cloud";
import { getSupabaseBrowser } from "@/lib/supabase/client";
import { computeTargets } from "@/lib/goals";

interface Ctx {
  ready: boolean;
  today: string;
  email: string | null;
  cloud: boolean;
  canImport: boolean;
  profile: Profile | null;
  targets: Targets | null;
  food: FoodLog[];
  workouts: WorkoutLog[];
  weights: WeightLog[];
  customFoods: CustomFood[];
  error: string | null;
  saveProfile(p: Profile): Promise<void>;
  addFood(f: Omit<FoodLog, "id" | "day"> & { day?: string }): Promise<void>;
  updateFood(id: string, patch: Partial<Omit<FoodLog, "id" | "day">>): Promise<void>;
  deleteFood(id: string): Promise<void>;
  addWorkout(w: Omit<WorkoutLog, "id" | "day"> & { day?: string }): Promise<void>;
  updateWorkout(id: string, patch: Partial<Omit<WorkoutLog, "id">>): Promise<void>;
  deleteWorkout(id: string): Promise<void>;
  /** one entry per day; kg is always stored in kilograms */
  setWeight(kg: number, day?: string): Promise<void>;
  deleteWeight(id: string): Promise<void>;
  addCustomFood(f: Omit<CustomFood, "id">): Promise<void>;
  updateCustomFood(id: string, patch: Partial<Omit<CustomFood, "id">>): Promise<void>;
  deleteCustomFood(id: string): Promise<void>;
  /** Permanently removes all of this user's data from the current store (device or account). */
  deleteAllData(): Promise<void>;
  importLocal(): Promise<void>;
  signOut(): Promise<void>;
}

const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
};

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [today, setToday] = useState("");
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [food, setFood] = useState<FoodLog[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutLog[]>([]);
  const [weights, setWeights] = useState<WeightLog[]>([]);
  const [customFoods, setCustomFoods] = useState<CustomFood[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [canImport, setCanImport] = useState(false);
  const [authDone, setAuthDone] = useState(() => !getSupabaseBrowser());
  const importing = useRef(false);
  const loadId = useRef(0);

  const repo: Repo = useMemo(() => {
    const sb = getSupabaseBrowser();
    return sb && userId ? cloudRepo(sb, userId) : localRepo;
  }, [userId]);

  useEffect(() => {
    setToday(localDay());
    const sb = getSupabaseBrowser();
    if (!sb) return;
    sb.auth.getUser().then(({ data }: { data: { user: { id: string; email?: string } | null } }) => {
      setUserId(data.user?.id ?? null);
      setEmail(data.user?.email ?? null);
      setAuthDone(true);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e: string, s: { user: { id: string; email?: string } } | null) => {
      setUserId(s?.user.id ?? null);
      setEmail(s?.user.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    const mine = ++loadId.current;
    try {
      const [p, f, w, wt, cf] = await Promise.all([
        repo.getProfile(), repo.listFood(), repo.listWorkouts(), repo.listWeights(), repo.listCustomFoods(),
      ]);
      if (mine !== loadId.current) return;
      setProfile(p); setFood(f); setWorkouts(w); setWeights(wt); setCustomFoods(cf); setError(null);
      if (repo.kind === "cloud") {
        const snap = readLocalSnapshot();
        setCanImport(Boolean(snap.profile || snap.food.length || snap.workouts.length) && !p);
      } else setCanImport(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your data.");
    } finally {
      if (mine === loadId.current) setReady(true);
    }
  }, [repo]);

  useEffect(() => { if (authDone) void load(); }, [load, authDone]);

  const sortWeights = (a: WeightLog[]) => [...a].sort((x, y) => x.day.localeCompare(y.day));

  const value: Ctx = {
    ready, today, email, cloud: repo.kind === "cloud", canImport, profile, error,
    targets: profile ? computeTargets(profile) : null,
    food, workouts, weights, customFoods,
    async saveProfile(p) { await repo.saveProfile(p); setProfile(p); },
    async addFood(f) { const row = await repo.addFood({ ...f, day: f.day ?? today }); setFood((x) => [...x, row]); },
    async updateFood(id, patch) { const row = await repo.updateFood(id, patch); setFood((x) => x.map((r) => (r.id === id ? row : r))); },
    async deleteFood(id) { await repo.deleteFood(id); setFood((x) => x.filter((r) => r.id !== id)); },
    async addWorkout(w) { const row = await repo.addWorkout({ ...w, day: w.day ?? today }); setWorkouts((x) => [...x, row]); },
    async updateWorkout(id, patch) { const row = await repo.updateWorkout(id, patch); setWorkouts((x) => x.map((r) => (r.id === id ? row : r))); },
    async deleteWorkout(id) { await repo.deleteWorkout(id); setWorkouts((x) => x.filter((r) => r.id !== id)); },
    async setWeight(kg, day) {
      const row = await repo.setWeight(day ?? today, kg);
      setWeights((x) => sortWeights([...x.filter((r) => r.day !== row.day), row]));
    },
    async deleteWeight(id) { await repo.deleteWeight(id); setWeights((x) => x.filter((r) => r.id !== id)); },
    async addCustomFood(f) { const row = await repo.addCustomFood(f); setCustomFoods((x) => [...x, row]); },
    async updateCustomFood(id, patch) { const row = await repo.updateCustomFood(id, patch); setCustomFoods((x) => x.map((r) => (r.id === id ? row : r))); },
    async deleteCustomFood(id) { await repo.deleteCustomFood(id); setCustomFoods((x) => x.filter((r) => r.id !== id)); },
    async deleteAllData() {
      for (const r of food) await repo.deleteFood(r.id);
      for (const r of workouts) await repo.deleteWorkout(r.id);
      for (const r of weights) await repo.deleteWeight(r.id);
      for (const r of customFoods) await repo.deleteCustomFood(r.id);
      if (repo.kind === "local") clearLocal();
      else {
        const sb = getSupabaseBrowser();
        if (sb && userId) await sb.from("profiles").delete().eq("id", userId);
      }
      setProfile(null); setFood([]); setWorkouts([]); setWeights([]); setCustomFoods([]);
    },
    async importLocal() {
      if (importing.current) return;
      importing.current = true;
      try {
        const snap = readLocalSnapshot();
        if (snap.profile) await repo.saveProfile(snap.profile);
        for (const f of snap.food) { const { id, ...rest } = f; void id; await repo.addFood(rest); }
        for (const w of snap.workouts) { const { id, ...rest } = w; void id; await repo.addWorkout(rest); }
        for (const w of snap.weights) await repo.setWeight(w.day, w.kg);
        for (const c of snap.customFoods) { const { id, ...rest } = c; void id; await repo.addCustomFood(rest); }
        clearLocal();
      } finally {
        importing.current = false;
      }
      await load();
    },
    async signOut() {
      await getSupabaseBrowser()?.auth.signOut();
      setProfile(null); setFood([]); setWorkouts([]); setWeights([]); setCustomFoods([]);
    },
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
