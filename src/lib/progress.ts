/**
 * Pure calculations behind the Progress screen. Every function tolerates empty data,
 * gaps between days, duplicate days and unsorted input. Days are local "YYYY-MM-DD"
 * strings; day arithmetic runs on UTC day numbers so DST never shifts a date.
 */
import type { FoodLog, Goal, MuscleGroup, WeightLog, WorkoutLog } from "./types";
import { MUSCLES } from "./exercises";

const DAY_MS = 86_400_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- day helpers ----------

/** Whole days since 1970-01-01 for a "YYYY-MM-DD" string (NaN if malformed). */
export function dayNum(day: string): number {
  if (typeof day !== "string" || !DAY_RE.test(day)) return NaN;
  const [y, m, d] = day.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}
export const fromDayNum = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
export const addDays = (day: string, n: number) => fromDayNum(dayNum(day) + n);
export const isDay = (s: string) => Number.isFinite(dayNum(s));
/** b - a in days. */
export const daysBetween = (a: string, b: string) => dayNum(b) - dayNum(a);

/** `n` consecutive days ending at `today`, oldest first. */
export function dayList(today: string, n: number): string[] {
  const t = dayNum(today);
  if (!Number.isFinite(t) || n <= 0) return [];
  return Array.from({ length: n }, (_, i) => fromDayNum(t - (n - 1 - i)));
}

export const RANGES = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 } as const;
export type RangeKey = keyof typeof RANGES;

/** Rows whose day falls in the `days`-long window ending at `today` (inclusive), sorted by day. */
export function inRange<T extends { day: string }>(rows: T[], today: string, days: number): T[] {
  const end = dayNum(today);
  const start = end - days + 1;
  return rows
    .filter((r) => { const n = dayNum(r.day); return n >= start && n <= end; })
    .sort((a, b) => a.day.localeCompare(b.day));
}

// ---------- weight ----------

export interface WeightPoint { day: string; kg: number }

/** Valid, one-per-day (last write wins), sorted weights. */
export function cleanWeights(weights: WeightLog[] | WeightPoint[]): WeightPoint[] {
  const byDay = new Map<string, number>();
  for (const w of weights) {
    if (!w || !isDay(w.day) || !Number.isFinite(w.kg) || w.kg <= 0) continue;
    byDay.set(w.day, w.kg);
  }
  return [...byDay].map(([day, kg]) => ({ day, kg })).sort((a, b) => a.day.localeCompare(b.day));
}

/**
 * Smoothed trend: for each weigh-in, the mean of all weigh-ins in the `window` calendar days
 * ending on that day. Calendar-based, so a gap does not drag old readings forward.
 */
export function trendLine(weights: WeightPoint[], window = 7): WeightPoint[] {
  const pts = cleanWeights(weights);
  const nums = pts.map((p) => dayNum(p.day));
  let lo = 0, sum = 0;
  return pts.map((p, i) => {
    sum += p.kg;
    while (nums[i] - nums[lo] >= window) { sum -= pts[lo].kg; lo++; }
    return { day: p.day, kg: sum / (i - lo + 1) };
  });
}

/** Least-squares slope in kg per week; null with fewer than 2 points or under `minSpan` days of data. */
export function weeklyRate(points: WeightPoint[], minSpan = 6): number | null {
  const pts = cleanWeights(points);
  if (pts.length < 2) return null;
  const xs = pts.map((p) => dayNum(p.day));
  if (xs[xs.length - 1] - xs[0] < minSpan) return null;
  const n = pts.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = pts.reduce((a, p) => a + p.kg, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (pts[i].kg - my); den += (xs[i] - mx) ** 2; }
  return den === 0 ? null : (num / den) * 7;
}

export type Direction = "down" | "up" | "flat";
export interface PaceRead {
  direction: Direction;
  /** rate as % of body weight per week (signed) */
  pctPerWeek: number;
  /** faster than 1% of body weight per week in either direction */
  tooFast: boolean;
  /** heading the way the goal wants */
  onTrack: boolean;
}

/** Interprets a weekly rate against the user's goal. "Flat" is within ±0.1 kg/week. */
export function readPace(rateKgWk: number, currentKg: number, goal: Goal): PaceRead {
  const pct = currentKg > 0 ? (rateKgWk / currentKg) * 100 : 0;
  const direction: Direction = Math.abs(rateKgWk) < 0.1 ? "flat" : rateKgWk < 0 ? "down" : "up";
  const onTrack = goal === "lose" ? direction === "down" : goal === "gain" ? direction === "up" : direction === "flat";
  return { direction, pctPerWeek: pct, tooFast: Math.abs(pct) > 1, onTrack };
}

export interface WeightSummary {
  points: WeightPoint[];
  trend: WeightPoint[];
  first: WeightPoint | null;
  latest: WeightPoint | null;
  change: number | null;
  min: WeightPoint | null;
  max: WeightPoint | null;
  rateKgWk: number | null;
}

/** Everything the weight chart and its summary need for one range. */
export function weightSummary(weights: WeightLog[] | WeightPoint[], today: string, days: number): WeightSummary {
  const all = cleanWeights(weights);
  const points = inRange(all, today, days);
  // trend uses the full history so the first points in a range are already smoothed
  const trend = inRange(trendLine(all), today, days);
  const first = points[0] ?? null;
  const latest = points[points.length - 1] ?? null;
  let min: WeightPoint | null = null, max: WeightPoint | null = null;
  for (const p of points) {
    if (!min || p.kg < min.kg) min = p;
    if (!max || p.kg > max.kg) max = p;
  }
  return {
    points, trend, first, latest, min, max,
    change: first && latest && points.length > 1 ? latest.kg - first.kg : null,
    rateKgWk: weeklyRate(points),
  };
}

export type WeightCheck = { ok: true; kg: number; warning: string | null } | { ok: false; error: string };

/** Validates a weight in kg: 20-500 is accepted, outside 30-300 gets a double-check warning. */
export function checkWeight(kg: number): WeightCheck {
  if (!Number.isFinite(kg)) return { ok: false, error: "Enter a number." };
  if (kg < 20 || kg > 500) return { ok: false, error: "That looks off. Enter a weight between 20 and 500 kg (44 to 1,102 lb)." };
  const warning = kg < 30 || kg > 300 ? "That's outside the usual range. Double-check it before saving." : null;
  return { ok: true, kg: Math.round(kg * 100) / 100, warning };
}

// ---------- calories ----------

export interface DayTotals { day: string; kcal: number; proteinG: number; carbsG: number; fatG: number; logged: boolean }

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** One row per day in the window (including days with nothing logged), oldest first. */
export function dailyTotals(food: FoodLog[], today: string, days: number): DayTotals[] {
  const list = dayList(today, days);
  const map = new Map(list.map((d) => [d, { day: d, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, logged: false }]));
  for (const f of food) {
    const row = map.get(f.day);
    if (!row) continue;
    row.kcal += num(f.kcal); row.proteinG += num(f.proteinG); row.carbsG += num(f.carbsG); row.fatG += num(f.fatG);
    row.logged = true;
  }
  return list.map((d) => map.get(d)!);
}

export interface CalorieStats {
  loggedDays: number;
  avgKcal: number;
  /** logged days within ±10% of target */
  onTarget: number;
  /** logged day closest to the target */
  best: DayTotals | null;
  /** logged day furthest from the target */
  worst: DayTotals | null;
}

export const onTargetDay = (kcal: number, target: number) => target > 0 && Math.abs(kcal - target) <= target * 0.1;

/** Averages count only days with something logged, so a forgotten day does not look like a fast. */
export function calorieStats(daily: DayTotals[], target: number): CalorieStats {
  const logged = daily.filter((d) => d.logged);
  if (!logged.length) return { loggedDays: 0, avgKcal: 0, onTarget: 0, best: null, worst: null };
  let best = logged[0], worst = logged[0];
  for (const d of logged) {
    if (Math.abs(d.kcal - target) < Math.abs(best.kcal - target)) best = d;
    if (Math.abs(d.kcal - target) > Math.abs(worst.kcal - target)) worst = d;
  }
  return {
    loggedDays: logged.length,
    avgKcal: logged.reduce((a, d) => a + d.kcal, 0) / logged.length,
    onTarget: logged.filter((d) => onTargetDay(d.kcal, target)).length,
    best, worst,
  };
}

export interface MacroSplit {
  avg: { proteinG: number; carbsG: number; fatG: number };
  /** share of macro calories, 0-1 each, summing to 1 (or all 0 with no data) */
  share: { protein: number; carbs: number; fat: number };
}

export function macroSplit(daily: DayTotals[]): MacroSplit {
  const logged = daily.filter((d) => d.logged);
  const n = logged.length || 1;
  const avg = {
    proteinG: logged.reduce((a, d) => a + d.proteinG, 0) / n,
    carbsG: logged.reduce((a, d) => a + d.carbsG, 0) / n,
    fatG: logged.reduce((a, d) => a + d.fatG, 0) / n,
  };
  const p = avg.proteinG * 4, c = avg.carbsG * 4, f = avg.fatG * 9;
  const total = p + c + f;
  return { avg, share: total > 0 ? { protein: p / total, carbs: c / total, fat: f / total } : { protein: 0, carbs: 0, fat: 0 } };
}

export const perKg = (grams: number, kg: number) => (kg > 0 && Number.isFinite(grams) ? grams / kg : 0);

// ---------- training ----------

/** Monday that starts the week containing `day`, as a day number. */
export function weekStartNum(day: string): number {
  const n = dayNum(day);
  return n - (((n + 3) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

export interface WeekBucket { start: string; workouts: number; activeDays: number }

/** The last `weeks` calendar weeks (Mon-Sun) up to the one containing `today`, oldest first. */
export function workoutWeeks(workouts: WorkoutLog[], today: string, weeks = 8): WeekBucket[] {
  const cur = weekStartNum(today);
  const end = dayNum(today);
  const buckets = Array.from({ length: weeks }, (_, i) => ({ n: cur - (weeks - 1 - i) * 7, workouts: 0, days: new Set<string>() }));
  for (const w of workouts) {
    const d = dayNum(w.day);
    if (!Number.isFinite(d) || d > end) continue;
    const b = buckets.find((x) => d >= x.n && d < x.n + 7);
    if (b) { b.workouts++; b.days.add(w.day); }
  }
  return buckets.map((b) => ({ start: fromDayNum(b.n), workouts: b.workouts, activeDays: b.days.size }));
}

export interface Streaks {
  /** consecutive calendar weeks with at least one workout, up to now */
  current: number;
  best: number;
  /** a workout already happened this week */
  thisWeek: boolean;
}

/**
 * Weekly streak: consecutive Monday-to-Sunday weeks with at least one workout, so rest days never
 * break it. The current week gets grace: until it ends, the streak counts from last week.
 */
export function workoutStreaks(workouts: WorkoutLog[], today: string): Streaks {
  const end = dayNum(today);
  const weeks = new Set<number>();
  for (const w of workouts) {
    const d = dayNum(w.day);
    if (Number.isFinite(d) && d <= end) weeks.add(weekStartNum(w.day));
  }
  const cur = weekStartNum(today);
  const thisWeek = weeks.has(cur);
  let current = 0;
  for (let w = thisWeek ? cur : cur - 7; weeks.has(w); w -= 7) current++;
  let best = 0, run = 0, prev = NaN;
  for (const w of [...weeks].sort((a, b) => a - b)) {
    run = w - prev === 7 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = w;
  }
  return { current, best, thisWeek };
}

export interface MuscleVolume { id: string; label: string; sets: number; reps: number; volume: number }

/** Sets, reps and volume (reps x kg) per muscle group in the window, most volume first then most sets. */
export function volumeByMuscle(workouts: WorkoutLog[], today: string, days: number, muscles: MuscleGroup[] = MUSCLES): MuscleVolume[] {
  const map = new Map(muscles.map((m) => [m.id, { id: m.id, label: m.label, sets: 0, reps: 0, volume: 0 }]));
  for (const w of inRange(workouts, today, days)) {
    for (const e of w.entries ?? []) {
      const row = map.get(e.muscleId);
      if (!row) continue;
      for (const s of e.sets ?? []) {
        const reps = Math.max(0, num(s.reps)), kg = Math.max(0, num(s.weightKg));
        row.sets++; row.reps += reps; row.volume += reps * kg;
      }
    }
  }
  return [...map.values()].sort((a, b) => b.volume - a.volume || b.sets - a.sets);
}

export interface StaleMuscle { id: string; label: string; last: string | null; daysAgo: number | null }

/** Muscle groups with no sets in the last `days` days, never-trained first, then longest ago. */
export function staleMuscles(workouts: WorkoutLog[], today: string, days = 14, muscles: MuscleGroup[] = MUSCLES): StaleMuscle[] {
  const end = dayNum(today);
  const last = new Map<string, string>();
  for (const w of workouts) {
    const d = dayNum(w.day);
    if (!Number.isFinite(d) || d > end) continue;
    for (const e of w.entries ?? []) {
      if (!(e.sets ?? []).length) continue;
      const prev = last.get(e.muscleId);
      if (!prev || w.day > prev) last.set(e.muscleId, w.day);
    }
  }
  return muscles
    .map((m) => { const l = last.get(m.id) ?? null; return { id: m.id, label: m.label, last: l, daysAgo: l ? end - dayNum(l) : null }; })
    .filter((m) => m.daysAgo === null || m.daysAgo >= days)
    .sort((a, b) => (b.daysAgo ?? 1e9) - (a.daysAgo ?? 1e9));
}
