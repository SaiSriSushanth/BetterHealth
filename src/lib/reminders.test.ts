import { describe, expect, it } from "vitest";
import {
  DEFAULT_REMINDERS, FIRE_WINDOW_MIN, WATER_TIMES, allReminderIds, clearFired, dayKey, dueReminders, firedKey,
  formatTime, markFired, nextReminder, normalizeReminders, parseTime, readFired, scheduleFor,
} from "./reminders";
import type { Reminders } from "./types";

const on: Reminders = { ...DEFAULT_REMINDERS, enabled: true };
const none = { mealsLogged: [] as const, workoutLogged: false, weighedIn: false };
// 2026-10-19 is a Monday, 2026-10-20 a Tuesday
const at = (hhmm: string, day = "2026-10-19") => new Date(`${day}T${hhmm}:00`);
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

function memStorage() {
  const m = new Map<string, string>();
  return {
    m,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}

describe("parsing and formatting", () => {
  it("parses HH:MM and rejects junk", () => {
    expect(parseTime("07:30")).toBe(450);
    expect(parseTime("23:59")).toBe(1439);
    expect(parseTime("24:00")).toBeNull();
    expect(parseTime("7:30")).toBeNull();
    expect(parseTime(null)).toBeNull();
  });
  it("formats friendly times", () => {
    expect(formatTime("00:05")).toBe("12:05 am");
    expect(formatTime("13:00")).toBe("1:00 pm");
    expect(formatTime("12:00")).toBe("12:00 pm");
  });
  it("uses local day keys", () => {
    expect(dayKey(at("23:59"))).toBe("2026-10-19");
  });
});

describe("normalizeReminders", () => {
  it("fills defaults for missing data", () => {
    expect(normalizeReminders(undefined)).toEqual(DEFAULT_REMINDERS);
  });
  it("keeps nulls (off) and replaces invalid times", () => {
    const r = normalizeReminders({ enabled: true, lunch: null, dinner: "bad" as string, water: true });
    expect(r.enabled).toBe(true);
    expect(r.lunch).toBeNull();
    expect(r.dinner).toBe("19:30");
    expect(r.water).toBe(true);
  });
});

describe("scheduleFor", () => {
  it("is empty when disabled", () => {
    expect(scheduleFor(at("08:00"), DEFAULT_REMINDERS)).toEqual([]);
  });
  it("includes weigh-in only on Mondays", () => {
    expect(ids(scheduleFor(at("08:00"), on))).toContain("weighIn");
    expect(ids(scheduleFor(at("08:00", "2026-10-20"), on))).not.toContain("weighIn");
  });
  it("adds water every 2h from 9 to 21 when on", () => {
    const water = scheduleFor(at("08:00"), { ...on, water: true }).filter((e) => e.kind === "water");
    expect(water.map((e) => e.time)).toEqual([...WATER_TIMES]);
    expect(water[0].id).toBe("water-0900");
  });
  it("skips reminders that are switched off", () => {
    expect(ids(scheduleFor(at("08:00"), { ...on, breakfast: null }))).not.toContain("breakfast");
  });
  it("is sorted by time", () => {
    const times = scheduleFor(at("08:00"), { ...on, water: true }).map((e) => parseTime(e.time)!);
    expect([...times].sort((a, b) => a - b)).toEqual(times);
  });
});

describe("dueReminders", () => {
  it("fires at the exact time and within the window", () => {
    expect(ids(dueReminders(at("13:00"), on, none, {}))).toEqual(["lunch"]);
    expect(ids(dueReminders(at("13:30"), on, none, {}))).toEqual(["lunch"]);
  });
  it("does not fire before the time or after the window", () => {
    expect(dueReminders(at("12:59"), on, none, {})).toEqual([]);
    const late = new Date(at("13:00").getTime() + FIRE_WINDOW_MIN * 60_000);
    expect(dueReminders(late, on, none, {})).toEqual([]);
  });
  it("fires at most once per day", () => {
    expect(dueReminders(at("13:05"), on, none, { lunch: "2026-10-19" })).toEqual([]);
    // yesterday's fire does not block today
    expect(ids(dueReminders(at("13:05"), on, none, { lunch: "2026-10-18" }))).toEqual(["lunch"]);
  });
  it("skips a meal that is already logged", () => {
    expect(dueReminders(at("08:10"), { ...on, weighIn: null }, { ...none, mealsLogged: ["breakfast"] }, {})).toEqual([]);
    expect(ids(dueReminders(at("08:10"), { ...on, weighIn: null }, { ...none, mealsLogged: new Set(["lunch"] as const) }, {}))).toEqual(["breakfast"]);
  });
  it("skips workout if one is logged today", () => {
    expect(dueReminders(at("18:01"), on, { ...none, workoutLogged: true }, {})).toEqual([]);
    expect(ids(dueReminders(at("18:01"), on, none, {}))).toEqual(["workout"]);
  });
  it("fires the weigh-in on Monday unless already weighed", () => {
    expect(ids(dueReminders(at("07:31"), on, none, {}))).toEqual(["weighIn"]);
    expect(dueReminders(at("07:31"), on, { ...none, weighedIn: true }, {})).toEqual([]);
    expect(dueReminders(at("07:31", "2026-10-20"), on, none, {})).toEqual([]);
  });
  it("fires water slots independently", () => {
    const cfg = { ...on, water: true, lunch: null };
    expect(ids(dueReminders(at("13:00"), cfg, none, {}))).toEqual(["water-1300"]);
    expect(dueReminders(at("13:00"), cfg, none, { "water-1300": "2026-10-19" })).toEqual([]);
    expect(dueReminders(at("14:00"), cfg, none, {})).toEqual([]);
  });
  it("does nothing when reminders are disabled", () => {
    expect(dueReminders(at("13:00"), { ...on, enabled: false }, none, {})).toEqual([]);
  });
});

describe("nextReminder", () => {
  it("finds the next one today", () => {
    expect(nextReminder(at("09:00"), on)?.id).toBe("lunch");
    expect(nextReminder(at("20:00"), on)).toBeNull();
  });
});

describe("fired storage", () => {
  it("round-trips and clears", () => {
    const s = memStorage();
    markFired(s, "lunch", "2026-10-19");
    expect(s.m.get(firedKey("lunch"))).toBe("2026-10-19");
    expect(readFired(s).lunch).toBe("2026-10-19");
    expect(readFired(s).dinner).toBeNull();
    clearFired(s);
    expect(s.m.size).toBe(0);
  });
  it("never throws when storage is blocked", () => {
    const bad = { getItem: () => { throw new Error("no"); }, setItem: () => { throw new Error("no"); }, removeItem: () => { throw new Error("no"); } };
    expect(() => markFired(bad, "lunch", "x")).not.toThrow();
    expect(readFired(bad).lunch).toBeNull();
    expect(() => clearFired(bad)).not.toThrow();
    expect(readFired(null)).toHaveProperty("lunch", null);
  });
  it("lists every id including water slots", () => {
    expect(allReminderIds()).toHaveLength(5 + WATER_TIMES.length);
  });
});
