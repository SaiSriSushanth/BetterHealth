import type { WorkoutEntry, WorkoutLog, WorkoutSet } from "./types";

/** Pure helpers for workout history, editing and the builder. No React, no storage. */

export const REPS_MAX = 100;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseDay(day: string): Date | null {
  if (!DAY_RE.test(day)) return null;
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}
function fmtDay(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}
/** Shift a YYYY-MM-DD day by n local days. */
export function addDays(day: string, n: number): string {
  const dt = parseDay(day);
  if (!dt) return day;
  return fmtDay(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + n));
}
/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  const da = parseDay(a), db = parseDay(b);
  if (!da || !db) return NaN;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

/** Newest first: by day, then by save order (later in the array = newer). Does not mutate. */
export function sortNewestFirst(workouts: WorkoutLog[]): WorkoutLog[] {
  return workouts
    .map((w, i) => ({ w, i }))
    .sort((a, b) => b.w.day.localeCompare(a.w.day) || b.i - a.i)
    .map((x) => x.w);
}

/** Monday of the week containing `day`. */
export function weekStart(day: string): string {
  const dt = parseDay(day);
  if (!dt) return day;
  const offset = (dt.getDay() + 6) % 7;
  return addDays(day, -offset);
}

export function shortDate(day: string, today?: string): string {
  const dt = parseDay(day);
  if (!dt) return day;
  const base = `${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
  return today && today.slice(0, 4) !== day.slice(0, 4) ? `${base} ${dt.getFullYear()}` : base;
}

/** "Today", "Yesterday", "Monday" within the last week, otherwise "Mon 5 Oct". */
export function friendlyDay(day: string, today: string): string {
  const dt = parseDay(day);
  if (!dt) return day;
  const diff = daysBetween(day, today);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  if (diff > 1 && diff < 7) return WEEKDAYS[dt.getDay()];
  return `${WEEKDAYS[dt.getDay()].slice(0, 3)} ${shortDate(day, today)}`;
}

export function weekLabel(start: string, today: string): string {
  const thisWeek = weekStart(today);
  if (start === thisWeek) return "This week";
  if (start === addDays(thisWeek, -7)) return "Last week";
  return `Week of ${shortDate(start, today)}`;
}

export interface WeekGroup {
  start: string;
  label: string;
  workouts: WorkoutLog[];
  sets: number;
}

/** Groups workouts by Monday-start week, newest week first, newest workout first inside. */
export function groupByWeek(workouts: WorkoutLog[], today: string): WeekGroup[] {
  const groups: WeekGroup[] = [];
  for (const w of sortNewestFirst(workouts)) {
    const start = weekStart(w.day);
    let g = groups[groups.length - 1];
    if (!g || g.start !== start) {
      g = { start, label: weekLabel(start, today), workouts: [], sets: 0 };
      groups.push(g);
    }
    g.workouts.push(w);
    g.sets += countSets(w.entries);
  }
  return groups;
}

export function countSets(entries: WorkoutEntry[]): number {
  return entries.reduce((n, e) => n + e.sets.length, 0);
}
/** Total reps x kg. */
export function volumeKg(entries: WorkoutEntry[]): number {
  return entries.reduce((v, e) => v + e.sets.reduce((s, x) => s + (x.reps || 0) * (x.weightKg || 0), 0), 0);
}
export function workoutStats(w: Pick<WorkoutLog, "entries">) {
  return { moves: w.entries.length, sets: countSets(w.entries), volumeKg: volumeKg(w.entries) };
}
/** Unique muscle ids, in the order they first appear. */
export function musclesOf(entries: WorkoutEntry[]): string[] {
  return [...new Set(entries.map((e) => e.muscleId))];
}

/** The heaviest set (ties broken by reps). */
export function topSet(sets: WorkoutSet[]): WorkoutSet | null {
  let best: WorkoutSet | null = null;
  for (const s of sets) if (!best || s.weightKg > best.weightKg || (s.weightKg === best.weightKg && s.reps > best.reps)) best = s;
  return best;
}

export interface LastPerformance {
  day: string;
  sets: number;
  top: WorkoutSet;
  /** heaviest weight ever logged for this exercise */
  bestKg: number;
}

/** What the user did last time for this exercise, from history. `excludeId` skips a workout (e.g. the one being edited). */
export function lastPerformance(workouts: WorkoutLog[], exerciseId: string, excludeId?: string): LastPerformance | null {
  let last: LastPerformance | null = null;
  let bestKg = 0;
  for (const w of sortNewestFirst(workouts)) {
    if (w.id === excludeId) continue;
    for (const e of w.entries) {
      if (e.exerciseId !== exerciseId || !e.sets.length) continue;
      const t = topSet(e.sets)!;
      bestKg = Math.max(bestKg, t.weightKg);
      if (!last) last = { day: w.day, sets: e.sets.length, top: t, bestKg: 0 };
    }
  }
  return last ? { ...last, bestKg } : null;
}

/** Sets from the most recent time this exercise was logged (copied), or null. */
export function lastSetsFor(workouts: WorkoutLog[], exerciseId: string, excludeId?: string): WorkoutSet[] | null {
  for (const w of sortNewestFirst(workouts)) {
    if (w.id === excludeId) continue;
    const e = w.entries.find((x) => x.exerciseId === exerciseId && x.sets.length);
    if (e) return e.sets.map((s) => ({ ...s }));
  }
  return null;
}

export function cloneEntries(entries: WorkoutEntry[]): WorkoutEntry[] {
  return entries.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s })) }));
}

export function moveItem<T>(arr: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= arr.length || to >= arr.length) return arr;
  const next = [...arr];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/** kg rounded for display in the user's units (one decimal). */
export function displayWeight(kg: number, imperial: boolean): number {
  const v = imperial ? kg * 2.2046226 : kg;
  return Math.round(v * 10) / 10;
}
export function formatWeight(kg: number, imperial: boolean): string {
  return `${displayWeight(kg, imperial).toLocaleString()} ${imperial ? "lb" : "kg"}`;
}
export function formatSet(s: WorkoutSet, imperial: boolean): string {
  return s.weightKg > 0 ? `${s.reps} × ${formatWeight(s.weightKg, imperial)}` : `${s.reps} ${s.reps === 1 ? "rep" : "reps"}`;
}
export function formatVolume(kg: number, imperial: boolean): string {
  const v = Math.round(imperial ? kg * 2.2046226 : kg);
  return `${v.toLocaleString()} ${imperial ? "lb" : "kg"}`;
}

/** Returns a message that explains how to fix the first problem, or null if the date is fine. */
export function validateDay(day: string, today: string): string | null {
  if (!parseDay(day)) return "Pick a date for this workout.";
  if (day > today) return "That date is in the future. Pick today or an earlier day.";
  return null;
}

export interface EntryProblem {
  message: string;
  entry?: number;
  set?: number;
  field?: "reps" | "weightKg";
}

/** Reps must be whole numbers 0-100, weight a number >= 0, and there must be at least one exercise with a set. */
export function validateEntries(entries: WorkoutEntry[]): EntryProblem | null {
  if (!entries.length) return { message: "Add at least one exercise before saving." };
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!e.sets.length) return { message: `${e.name} has no sets. Add a set or remove the exercise.`, entry: i };
    for (let j = 0; j < e.sets.length; j++) {
      const s = e.sets[j];
      if (!Number.isInteger(s.reps) || s.reps < 0 || s.reps > REPS_MAX)
        return { message: `Reps for ${e.name}, set ${j + 1} must be a whole number from 0 to ${REPS_MAX}.`, entry: i, set: j, field: "reps" };
      if (!Number.isFinite(s.weightKg) || s.weightKg < 0)
        return { message: `Weight for ${e.name}, set ${j + 1} must be 0 or more. Use 0 for bodyweight.`, entry: i, set: j, field: "weightKg" };
    }
  }
  return null;
}

/** Same title, day and entries? Used for unsaved-changes checks. */
export function sameWorkout(a: Pick<WorkoutLog, "title" | "day" | "entries">, b: Pick<WorkoutLog, "title" | "day" | "entries">): boolean {
  return a.title === b.title && a.day === b.day && JSON.stringify(a.entries) === JSON.stringify(b.entries);
}
