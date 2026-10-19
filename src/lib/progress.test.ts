import { describe, expect, it } from "vitest";
import {
  addDays, calorieStats, checkWeight, cleanWeights, dailyTotals, dayList, inRange, macroSplit, perKg,
  readPace, staleMuscles, trendLine, volumeByMuscle, weekStartNum, weeklyRate, weightSummary,
  workoutStreaks, workoutWeeks, fromDayNum,
} from "./progress";
import type { FoodLog, WorkoutLog } from "./types";

const T = "2026-10-19"; // a Monday

const food = (day: string, kcal: number, p = 0, c = 0, f = 0): FoodLog => ({
  id: day + kcal, day, meal: "lunch", name: "x", portion: "1", grams: 100, source: "manual",
  kcal, proteinG: p, carbsG: c, fatG: f, fiberG: 0, sugarG: 0, sodiumMg: 0, potassiumMg: 0, calciumMg: 0, ironMg: 0, vitCMg: 0,
});
const wo = (day: string, muscleId = "chest", sets = [{ reps: 10, weightKg: 20 }]): WorkoutLog => ({
  id: day + muscleId, day, title: "W", entries: [{ exerciseId: "e", name: "E", muscleId, sets }],
});

describe("day helpers", () => {
  it("adds days across months and DST", () => {
    expect(addDays("2026-03-28", 3)).toBe("2026-03-31");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });
  it("lists days ending today, oldest first", () => {
    expect(dayList(T, 3)).toEqual(["2026-10-17", "2026-10-18", "2026-10-19"]);
    expect(dayList("bad", 3)).toEqual([]);
  });
  it("finds the Monday of a week", () => {
    expect(fromDayNum(weekStartNum("2026-10-19"))).toBe("2026-10-19");
    expect(fromDayNum(weekStartNum("2026-10-25"))).toBe("2026-10-19");
    expect(fromDayNum(weekStartNum("2026-10-18"))).toBe("2026-10-12");
  });
});

describe("range filtering", () => {
  it("keeps the inclusive window, sorts, drops future and malformed", () => {
    const rows = [{ day: "2026-10-19" }, { day: "2026-10-13" }, { day: "2026-10-12" }, { day: "2026-10-20" }, { day: "nope" }, { day: "2026-10-15" }];
    expect(inRange(rows, T, 7).map((r) => r.day)).toEqual(["2026-10-13", "2026-10-15", "2026-10-19"]);
    expect(inRange([], T, 7)).toEqual([]);
  });
});

describe("weight", () => {
  it("cleans duplicates (last wins), invalid values and order", () => {
    expect(cleanWeights([
      { id: "1", day: "2026-10-02", kg: 70 }, { id: "2", day: "2026-10-01", kg: 71 },
      { id: "3", day: "2026-10-02", kg: 69.5 }, { id: "4", day: "x", kg: 70 }, { id: "5", day: "2026-10-03", kg: NaN },
    ])).toEqual([{ day: "2026-10-01", kg: 71 }, { day: "2026-10-02", kg: 69.5 }]);
  });
  it("smooths with a calendar 7-day window that ignores readings across gaps", () => {
    const t = trendLine([
      { day: "2026-10-01", kg: 70 }, { day: "2026-10-02", kg: 72 }, { day: "2026-10-03", kg: 74 },
      { day: "2026-10-20", kg: 80 },
    ]);
    expect(t.map((p) => p.kg)).toEqual([70, 71, 72, 80]);
    expect(trendLine([])).toEqual([]);
  });
  it("trend window drops points 7+ days old", () => {
    const t = trendLine([{ day: "2026-10-01", kg: 70 }, { day: "2026-10-07", kg: 72 }, { day: "2026-10-08", kg: 74 }]);
    expect(t[1].kg).toBe(71);
    expect(t[2].kg).toBe(73); // 10-01 is 7 days before 10-08, outside the window
  });
  it("computes a weekly rate by regression, null when too little data", () => {
    const pts = Array.from({ length: 15 }, (_, i) => ({ day: addDays("2026-10-01", i), kg: 80 - i * 0.1 }));
    expect(weeklyRate(pts)).toBeCloseTo(-0.7, 6);
    expect(weeklyRate([...pts].reverse())).toBeCloseTo(-0.7, 6);
    expect(weeklyRate(pts.slice(0, 1))).toBeNull();
    expect(weeklyRate(pts.slice(0, 3))).toBeNull(); // spans 2 days
    expect(weeklyRate([])).toBeNull();
  });
  it("reads pace against the goal and flags > 1% a week", () => {
    expect(readPace(-0.5, 80, "lose")).toMatchObject({ direction: "down", onTrack: true, tooFast: false });
    expect(readPace(-1, 80, "lose").tooFast).toBe(true);
    expect(readPace(0.4, 80, "lose").onTrack).toBe(false);
    expect(readPace(0.05, 80, "maintain")).toMatchObject({ direction: "flat", onTrack: true });
    expect(readPace(0.3, 70, "gain").onTrack).toBe(true);
    expect(readPace(1, 0, "gain").pctPerWeek).toBe(0);
  });
  it("summarises a range: first, latest, change, min, max", () => {
    const s = weightSummary([
      { id: "a", day: "2026-10-19", kg: 72 }, { id: "b", day: "2026-10-13", kg: 73.5 },
      { id: "c", day: "2026-10-16", kg: 74 }, { id: "d", day: "2026-09-01", kg: 90 },
    ], T, 7);
    expect(s.first?.kg).toBe(73.5);
    expect(s.latest?.kg).toBe(72);
    expect(s.change).toBeCloseTo(-1.5);
    expect(s.min?.day).toBe("2026-10-19");
    expect(s.max?.day).toBe("2026-10-16");
    expect(s.rateKgWk).not.toBeNull();
    const e = weightSummary([], T, 30);
    expect(e).toMatchObject({ first: null, latest: null, change: null, rateKgWk: null, points: [] });
  });
  it("validates 20-500 kg and warns outside 30-300", () => {
    expect(checkWeight(70)).toEqual({ ok: true, kg: 70, warning: null });
    expect(checkWeight(25)).toMatchObject({ ok: true, warning: expect.any(String) });
    expect(checkWeight(19.9).ok).toBe(false);
    expect(checkWeight(501).ok).toBe(false);
    expect(checkWeight(NaN).ok).toBe(false);
  });
});

describe("calories", () => {
  const rows = [food("2026-10-19", 2000, 150, 200, 60), food("2026-10-19", 200, 10, 20, 5), food("2026-10-17", 1500, 100, 150, 50), food("2026-10-10", 9999)];
  it("totals every day in the window, marking unlogged days", () => {
    const d = dailyTotals(rows, T, 3);
    expect(d.map((x) => [x.day, x.kcal, x.logged])).toEqual([["2026-10-17", 1500, true], ["2026-10-18", 0, false], ["2026-10-19", 2200, true]]);
  });
  it("averages logged days only, counts days within ±10%, best and worst", () => {
    const s = calorieStats(dailyTotals(rows, T, 7), 2000);
    expect(s.loggedDays).toBe(2);
    expect(s.avgKcal).toBe(1850);
    expect(s.onTarget).toBe(1); // 2200 is exactly +10%
    expect(s.best?.day).toBe("2026-10-19");
    expect(s.worst?.day).toBe("2026-10-17");
    expect(calorieStats(dailyTotals([], T, 7), 2000)).toEqual({ loggedDays: 0, avgKcal: 0, onTarget: 0, best: null, worst: null });
  });
  it("splits macro calories into shares", () => {
    const m = macroSplit(dailyTotals([food(T, 0, 100, 100, 400 / 9)], T, 7));
    expect(m.share.protein).toBeCloseTo(400 / 1200);
    expect(m.share.fat).toBeCloseTo(400 / 1200);
    expect(m.avg.proteinG).toBe(100);
    expect(macroSplit([]).share).toEqual({ protein: 0, carbs: 0, fat: 0 });
    expect(perKg(144, 72)).toBe(2);
    expect(perKg(100, 0)).toBe(0);
  });
});

describe("training", () => {
  it("buckets workouts per calendar week", () => {
    const w = workoutWeeks([wo("2026-10-19"), wo("2026-10-12"), wo("2026-10-12", "lats"), wo("2026-10-18"), wo("2026-10-26")], T, 3);
    expect(w).toEqual([
      { start: "2026-10-05", workouts: 0, activeDays: 0 },
      { start: "2026-10-12", workouts: 3, activeDays: 2 },
      { start: "2026-10-19", workouts: 1, activeDays: 1 },
    ]);
  });
  it("counts weekly streaks with grace for the current week", () => {
    const hist = [wo("2026-10-14"), wo("2026-10-06"), wo("2026-09-29"), wo("2026-09-08"), wo("2026-09-01")];
    expect(workoutStreaks(hist, T)).toEqual({ current: 3, best: 3, thisWeek: false });
    expect(workoutStreaks([...hist, wo(T)], T)).toEqual({ current: 4, best: 4, thisWeek: true });
    expect(workoutStreaks([wo("2026-09-01")], T)).toEqual({ current: 0, best: 1, thisWeek: false });
    expect(workoutStreaks([], T)).toEqual({ current: 0, best: 0, thisWeek: false });
    expect(workoutStreaks([wo("2026-11-30")], T).best).toBe(0); // future ignored
  });
  it("sums sets and volume per muscle, sorted", () => {
    const v = volumeByMuscle([
      wo("2026-10-18", "chest", [{ reps: 10, weightKg: 50 }, { reps: 8, weightKg: 50 }]),
      wo("2026-10-19", "quads", [{ reps: 5, weightKg: 100 }]),
      wo("2026-10-19", "abs", [{ reps: 20, weightKg: 0 }]),
      wo("2026-08-01", "chest", [{ reps: 100, weightKg: 100 }]),
      wo("2026-10-19", "unknown"),
    ], T, 7);
    expect(v[0]).toMatchObject({ id: "chest", sets: 2, reps: 18, volume: 900 });
    expect(v[1]).toMatchObject({ id: "quads", volume: 500 });
    expect(v[2]).toMatchObject({ id: "abs", sets: 1, volume: 0 });
    expect(v.find((m) => m.id === "lats")?.sets).toBe(0);
  });
  it("lists muscles not trained in 14 days", () => {
    const s = staleMuscles([wo("2026-10-10", "chest"), wo("2026-10-01", "lats"), wo("2026-10-05", "quads")], T, 14);
    const ids = s.map((m) => m.id);
    expect(ids).not.toContain("chest");
    expect(ids).toContain("lats");
    expect(ids).toContain("quads"); // exactly 14 days
    expect(s.find((m) => m.id === "lats")?.daysAgo).toBe(18);
    expect(s[0].last).toBeNull(); // never-trained first
    expect(staleMuscles([], T).length).toBe(16);
  });
});
