import { describe, expect, it } from "vitest";
import { buildFoodCsv, buildJsonExport, csvCell } from "./exportData";
import { buildProfile, fieldsFromProfile, isDirty, switchUnits } from "./draft";
import type { FoodLog, Profile } from "../../lib/types";

const p: Profile = {
  name: "Sai", sex: "male", age: 28, heightCm: 175, weightKg: 72.35, goal: "maintain", activity: "moderate",
  equipment: ["bodyweight", "dumbbell"], units: "metric", reminders: { enabled: true, breakfast: "08:00", lunch: null, dinner: null, workout: null, weighIn: null, water: false },
};

describe("profile draft", () => {
  it("round-trips without drift and keeps other fields", () => {
    const f = fieldsFromProfile(p);
    const out = buildProfile(f, p, f);
    expect(out).toEqual(p);
    expect(isDirty(f, f)).toBe(false);
  });
  it("keeps exact values through a units switch and back", () => {
    const f = fieldsFromProfile(p);
    const imp = switchUnits(f, true, p, f);
    expect(imp.imperial).toBe(true);
    expect(isDirty(imp, f)).toBe(true);
    const back = switchUnits(imp, false, p, f);
    expect(isDirty(back, f)).toBe(false);
    expect(buildProfile(back, p, f).heightCm).toBe(175);
  });
  it("converts imperial edits", () => {
    const f = fieldsFromProfile({ ...p, units: "imperial" });
    const out = buildProfile({ ...f, wt: "160" }, p, f);
    expect(out.weightKg).toBeCloseTo(72.57, 1);
    expect(out.units).toBe("imperial");
  });
  it("treats blank numbers as invalid and empty equipment as bodyweight", () => {
    const f = fieldsFromProfile(p);
    const out = buildProfile({ ...f, age: "", equipment: [] }, p, f);
    expect(Number.isNaN(out.age)).toBe(true);
    expect(out.equipment).toEqual(["bodyweight"]);
  });
});

describe("exports", () => {
  it("escapes CSV cells and blocks formulas", () => {
    expect(csvCell('say "hi", ok')).toBe('"say ""hi"", ok"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell(1.23456)).toBe("1.23");
    expect(csvCell(undefined)).toBe("");
  });
  it("writes a sorted food diary", () => {
    const row = (day: string, name: string): FoodLog => ({ id: day, day, meal: "lunch", name, portion: "1 bowl", grams: 200, source: "manual",
      kcal: 300, proteinG: 10, carbsG: 40, fatG: 8, fiberG: 4, sugarG: 3, sodiumMg: 200, potassiumMg: 100, calciumMg: 50, ironMg: 1, vitCMg: 0 });
    const csv = buildFoodCsv([row("2026-10-19", "Soup"), row("2026-10-18", "Rice, egg")]).split("\r\n");
    expect(csv[0].startsWith("day,meal,name")).toBe(true);
    expect(csv[1]).toContain('"Rice, egg"');
    expect(csv[2]).toContain("Soup");
  });
  it("builds a JSON export", () => {
    const j = JSON.parse(buildJsonExport({ profile: p, targets: null, food: [], workouts: [], weights: [], customFoods: [], storedIn: "device" }, new Date("2026-10-19T00:00:00Z")));
    expect(j.app).toBe("BetterHealth");
    expect(j.profile.name).toBe("Sai");
    expect(j.exportedAt).toBe("2026-10-19T00:00:00.000Z");
  });
});
