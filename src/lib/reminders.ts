import type { Meal, Reminders } from "./types";

/** Sensible starting times. Weigh-in fires on Mondays only. */
export const DEFAULT_TIMES = {
  breakfast: "08:00",
  lunch: "13:00",
  dinner: "19:30",
  workout: "18:00",
  weighIn: "07:30",
} as const;

export const DEFAULT_REMINDERS: Reminders = {
  enabled: false,
  breakfast: DEFAULT_TIMES.breakfast,
  lunch: DEFAULT_TIMES.lunch,
  dinner: DEFAULT_TIMES.dinner,
  workout: DEFAULT_TIMES.workout,
  weighIn: DEFAULT_TIMES.weighIn,
  water: false,
};

/** Water reminders: every 2 hours from 09:00 to 21:00. */
export const WATER_TIMES = ["09:00", "11:00", "13:00", "15:00", "17:00", "19:00", "21:00"] as const;

/** A reminder only fires within this many minutes after its time, so opening the app late doesn't replay the whole day. */
export const FIRE_WINDOW_MIN = 45;

/** Day of week the weigh-in reminder fires (0 = Sunday, 1 = Monday). */
export const WEIGH_IN_DAY = 1;

export type ReminderKind = "breakfast" | "lunch" | "dinner" | "workout" | "weighIn" | "water";

export interface ReminderEvent {
  /** stable per day, e.g. "lunch" or "water-1300" */
  id: string;
  kind: ReminderKind;
  time: string;
  title: string;
  body: string;
  /** where the in-app banner sends you; empty means no link */
  href: string;
  /** link label; empty when there is no link */
  action: string;
}

export interface ReminderContext {
  /** meals with at least one food entry today */
  mealsLogged: ReadonlySet<Meal> | readonly Meal[];
  workoutLogged: boolean;
  weighedIn: boolean;
}

/** Merge whatever is stored (possibly missing or partial) with defaults. */
export function normalizeReminders(r: Partial<Reminders> | null | undefined): Reminders {
  const out: Reminders = { ...DEFAULT_REMINDERS };
  if (!r || typeof r !== "object") return out;
  out.enabled = r.enabled === true;
  out.water = r.water === true;
  for (const k of ["breakfast", "lunch", "dinner", "workout", "weighIn"] as const) {
    if (k in r) out[k] = r[k] === null ? null : parseTime(r[k]) ? (r[k] as string) : DEFAULT_TIMES[k];
  }
  return out;
}

/** "HH:MM" to minutes after midnight, or null if invalid. */
export function parseTime(t: unknown): number | null {
  if (typeof t !== "string") return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Local calendar day, YYYY-MM-DD. */
export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 24h "HH:MM" as a friendly label, e.g. "7:30 am". */
export function formatTime(t: string): string {
  const m = parseTime(t);
  if (m === null) return t;
  const h = Math.floor(m / 60), min = m % 60;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(min).padStart(2, "0")} ${suffix}`;
}

const COPY: Record<Exclude<ReminderKind, "water">, Omit<ReminderEvent, "id" | "kind" | "time">> = {
  breakfast: { title: "Time for breakfast", body: "Log what you eat so your plate stays accurate.", href: "/food", action: "Log breakfast" },
  lunch: { title: "Lunch check-in", body: "Nothing logged for lunch yet. Add it while you remember.", href: "/food", action: "Log lunch" },
  dinner: { title: "Dinner check-in", body: "Log dinner to close out today's plate.", href: "/food", action: "Log dinner" },
  workout: { title: "Workout time", body: "No workout logged today. Even 20 minutes counts.", href: "/train", action: "Start a workout" },
  weighIn: { title: "Monday weigh-in", body: "Step on the scale before breakfast for the most consistent reading.", href: "/progress", action: "Log weight" },
};

/** Every reminder that could fire today (ignores whether it was already fired or logged). */
export function scheduleFor(now: Date, cfg: Reminders): ReminderEvent[] {
  if (!cfg.enabled) return [];
  const out: ReminderEvent[] = [];
  const push = (kind: Exclude<ReminderKind, "water">, time: string | null) => {
    if (time && parseTime(time) !== null) out.push({ id: kind, kind, time, ...COPY[kind] });
  };
  push("breakfast", cfg.breakfast);
  push("lunch", cfg.lunch);
  push("dinner", cfg.dinner);
  push("workout", cfg.workout);
  if (now.getDay() === WEIGH_IN_DAY) push("weighIn", cfg.weighIn);
  if (cfg.water) {
    for (const t of WATER_TIMES) {
      out.push({ id: `water-${t.replace(":", "")}`, kind: "water", time: t, title: "Drink some water", body: "A glass now keeps you on track for the day.", href: "", action: "" });
    }
  }
  return out.sort((a, b) => (parseTime(a.time) ?? 0) - (parseTime(b.time) ?? 0));
}

/** Is this reminder already covered by something the user logged today? */
export function isSatisfied(e: Pick<ReminderEvent, "kind">, ctx: ReminderContext): boolean {
  const meals = ctx.mealsLogged instanceof Set ? ctx.mealsLogged : new Set(ctx.mealsLogged as readonly Meal[]);
  if (e.kind === "breakfast" || e.kind === "lunch" || e.kind === "dinner") return meals.has(e.kind);
  if (e.kind === "workout") return ctx.workoutLogged;
  if (e.kind === "weighIn") return ctx.weighedIn;
  return false;
}

/**
 * Reminders that should fire right now.
 * @param lastFired reminder id -> the YYYY-MM-DD it last fired
 */
export function dueReminders(now: Date, cfg: Reminders, ctx: ReminderContext, lastFired: Readonly<Record<string, string | null | undefined>>): ReminderEvent[] {
  const today = dayKey(now);
  const mins = minutesOfDay(now);
  return scheduleFor(now, cfg).filter((e) => {
    const at = parseTime(e.time);
    if (at === null || mins < at || mins >= at + FIRE_WINDOW_MIN) return false;
    if (lastFired[e.id] === today) return false;
    return !isSatisfied(e, ctx);
  });
}

/** The next reminder still ahead today (for the settings screen), or null. */
export function nextReminder(now: Date, cfg: Reminders): ReminderEvent | null {
  const mins = minutesOfDay(now);
  return scheduleFor(now, cfg).find((e) => (parseTime(e.time) ?? -1) > mins) ?? null;
}

/** Every id the runner may store a last-fired date for (used to clear them). */
export function allReminderIds(): string[] {
  return ["breakfast", "lunch", "dinner", "workout", "weighIn", ...WATER_TIMES.map((t) => `water-${t.replace(":", "")}`)];
}

export const firedKey = (id: string) => `betterhealth:reminder:${id}`;

/** Read last-fired dates from storage. Never throws. */
export function readFired(storage: Pick<Storage, "getItem"> | null | undefined, ids = allReminderIds()): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const id of ids) {
    try { out[id] = storage?.getItem(firedKey(id)) ?? null; } catch { out[id] = null; }
  }
  return out;
}

export function markFired(storage: Pick<Storage, "setItem"> | null | undefined, id: string, day: string): void {
  try { storage?.setItem(firedKey(id), day); } catch { /* storage blocked: may fire again after reload */ }
}

export function clearFired(storage: Pick<Storage, "removeItem"> | null | undefined): void {
  for (const id of allReminderIds()) {
    try { storage?.removeItem(firedKey(id)); } catch { /* ignore */ }
  }
}
