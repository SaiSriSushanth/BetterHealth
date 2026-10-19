import { describe, expect, it } from "vitest";
import {
  addDays, cloneEntries, lastSetsFor, formatSet, friendlyDay, groupByWeek, lastPerformance, moveItem, musclesOf,
  sameWorkout, sortNewestFirst, validateDay, validateEntries, weekStart, workoutStats,
} from "./workouts";
import type { WorkoutEntry, WorkoutLog } from "./types";

const bench = (sets: [number, number][]): WorkoutEntry => ({
  exerciseId: "bench-press", name: "Barbell Bench Press", muscleId: "chest",
  sets: sets.map(([reps, weightKg]) => ({ reps, weightKg })),
});
const squat: WorkoutEntry = { exerciseId: "back-squat", name: "Barbell Back Squat", muscleId: "quads", sets: [{ reps: 5, weightKg: 100 }] };
const w = (id: string, day: string, entries: WorkoutEntry[]): WorkoutLog => ({ id, day, title: id, entries });

// 2026-10-19 is a Monday
const TODAY = "2026-10-19";

describe("dates", () => {
  it("adds days across months", () => {
    expect(addDays("2026-10-01", -1)).toBe("2026-09-30");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("finds the Monday of a week", () => {
    expect(weekStart("2026-10-19")).toBe("2026-10-19");
    expect(weekStart("2026-10-25")).toBe("2026-10-19");
    expect(weekStart("2026-10-18")).toBe("2026-10-12");
  });
  it("labels days in a friendly way", () => {
    expect(friendlyDay(TODAY, TODAY)).toBe("Today");
    expect(friendlyDay("2026-10-18", TODAY)).toBe("Yesterday");
    expect(friendlyDay("2026-10-15", TODAY)).toBe("Thursday");
    expect(friendlyDay("2026-10-05", TODAY)).toBe("Mon 5 Oct");
    expect(friendlyDay("2025-10-05", TODAY)).toBe("Sun 5 Oct 2025");
  });
  it("validates the date", () => {
    expect(validateDay(TODAY, TODAY)).toBeNull();
    expect(validateDay("2026-10-20", TODAY)).toMatch(/future/);
    expect(validateDay("2026-02-30", TODAY)).toMatch(/Pick a date/);
    expect(validateDay("", TODAY)).toMatch(/Pick a date/);
  });
});

describe("history", () => {
  const list = [w("a", "2026-10-12", [squat]), w("b", "2026-10-19", [bench([[8, 60]])]), w("c", "2026-10-12", [squat]), w("d", "2026-10-01", [squat])];
  it("sorts newest day first, then by save order", () => {
    expect(sortNewestFirst(list).map((x) => x.id)).toEqual(["b", "c", "a", "d"]);
    expect(list[0].id).toBe("a");
  });
  it("groups by week with labels", () => {
    const g = groupByWeek(list, TODAY);
    expect(g.map((x) => x.label)).toEqual(["This week", "Last week", "Week of 28 Sep"]);
    expect(g[1].workouts.map((x) => x.id)).toEqual(["c", "a"]);
    expect(g[1].sets).toBe(2);
  });
  it("counts moves, sets and volume", () => {
    expect(workoutStats({ entries: [bench([[10, 50], [8, 60]]), squat] })).toEqual({ moves: 2, sets: 3, volumeKg: 500 + 480 + 500 });
  });
  it("lists unique muscles in order", () => {
    expect(musclesOf([bench([[1, 1]]), squat, bench([[1, 1]])])).toEqual(["chest", "quads"]);
  });
  it("finds last performance and best weight", () => {
    const h = [w("old", "2026-10-01", [bench([[5, 80]])]), w("new", "2026-10-15", [bench([[10, 60], [8, 70]])])];
    expect(lastPerformance(h, "bench-press")).toEqual({ day: "2026-10-15", sets: 2, top: { reps: 8, weightKg: 70 }, bestKg: 80 });
    expect(lastPerformance(h, "bench-press", "new")?.day).toBe("2026-10-01");
    expect(lastPerformance(h, "push-up")).toBeNull();
  });
  it("copies the last sets for an exercise", () => {
    const h = [w("old", "2026-10-01", [bench([[5, 80]])]), w("new", "2026-10-15", [bench([[10, 60], [8, 70]])])];
    const s = lastSetsFor(h, "bench-press")!;
    expect(s).toEqual([{ reps: 10, weightKg: 60 }, { reps: 8, weightKg: 70 }]);
    s[0].reps = 1;
    expect(h[1].entries[0].sets[0].reps).toBe(10);
    expect(lastSetsFor(h, "bench-press", "new")).toEqual([{ reps: 5, weightKg: 80 }]);
    expect(lastSetsFor(h, "push-up")).toBeNull();
  });
});

describe("editing", () => {
  it("moves items without mutating", () => {
    const a = [1, 2, 3];
    expect(moveItem(a, 0, 1)).toEqual([2, 1, 3]);
    expect(moveItem(a, 2, 3)).toBe(a);
    expect(a).toEqual([1, 2, 3]);
  });
  it("clones deeply", () => {
    const e = [bench([[5, 50]])];
    const c = cloneEntries(e);
    c[0].sets[0].reps = 9;
    expect(e[0].sets[0].reps).toBe(5);
  });
  it("validates reps, weight and exercises", () => {
    expect(validateEntries([])?.message).toMatch(/at least one exercise/);
    expect(validateEntries([bench([])])?.message).toMatch(/no sets/);
    expect(validateEntries([bench([[101, 0]])])).toMatchObject({ entry: 0, set: 0, field: "reps" });
    expect(validateEntries([bench([[5.5, 0]])])?.field).toBe("reps");
    expect(validateEntries([bench([[5, 10], [5, -1]])])).toMatchObject({ set: 1, field: "weightKg" });
    expect(validateEntries([bench([[5, NaN]])])?.field).toBe("weightKg");
    expect(validateEntries([bench([[0, 0], [100, 200]])])).toBeNull();
  });
  it("formats sets in the user's units", () => {
    expect(formatSet({ reps: 8, weightKg: 60 }, false)).toBe("8 × 60 kg");
    expect(formatSet({ reps: 8, weightKg: 45.359237 }, true)).toBe("8 × 100 lb");
    expect(formatSet({ reps: 12, weightKg: 0 }, false)).toBe("12 reps");
  });
  it("detects changes", () => {
    const a = w("a", TODAY, [squat]);
    expect(sameWorkout(a, { ...a, entries: cloneEntries(a.entries) })).toBe(true);
    expect(sameWorkout(a, { ...a, title: "x" })).toBe(false);
  });
});
