"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { FoodLog, Profile, Targets, WorkoutLog } from "@/lib/types";
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
  error: string | null;
  saveProfile(p: Profile): Promise<void>;
  addFood(f: Omit<FoodLog, "id" | "day">): Promise<void>;
  deleteFood(id: string): Promise<void>;
  addWorkout(w: Omit<WorkoutLog, "id" | "day">): Promise<void>;
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
      const [p, f, w] = await Promise.all([repo.getProfile(), repo.listFood(), repo.listWorkouts()]);
      if (mine !== loadId.current) return;
      setProfile(p); setFood(f); setWorkouts(w); setError(null);
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

  const value: Ctx = {
    ready, today, email, cloud: repo.kind === "cloud", canImport, profile, error,
    targets: profile ? computeTargets(profile) : null,
    food, workouts,
    async saveProfile(p) { await repo.saveProfile(p); setProfile(p); },
    async addFood(f) { const row = await repo.addFood({ ...f, day: today }); setFood((x) => [...x, row]); },
    async deleteFood(id) { await repo.deleteFood(id); setFood((x) => x.filter((r) => r.id !== id)); },
    async addWorkout(w) { const row = await repo.addWorkout({ ...w, day: today }); setWorkouts((x) => [...x, row]); },
    async importLocal() {
      if (importing.current) return;
      importing.current = true;
      const snap = readLocalSnapshot();
      if (snap.profile) await repo.saveProfile(snap.profile);
      for (const { id: _f, ...f } of snap.food) await repo.addFood(f);
      for (const { id: _w, ...w } of snap.workouts) await repo.addWorkout(w);
      clearLocal();
      importing.current = false;
      await load();
    },
    async signOut() { await getSupabaseBrowser()?.auth.signOut(); setProfile(null); setFood([]); setWorkouts([]); },
  };
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
