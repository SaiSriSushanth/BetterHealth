import { describe, expect, it } from "vitest";
import { computeTargets, bmr, cmToFtIn, ftInToCm, validateProfile } from "./goals";
import type { Profile } from "./types";

const base: Profile = {
  name: "T", sex: "male", age: 30, heightCm: 180, weightKg: 80,
  goal: "maintain", activity: "moderate", equipment: [], units: "metric",
};

describe("goals", () => {
  it("computes Mifflin-St Jeor BMR", () => {
    expect(bmr(base)).toBe(1780); // 800 + 1125 - 150 + 5
  });
  it("applies goal adjustments and floors", () => {
    const m = computeTargets(base);
    expect(computeTargets({ ...base, goal: "lose" }).kcal).toBe(m.kcal - 500);
    expect(computeTargets({ ...base, goal: "gain" }).kcal).toBe(m.kcal + 300);
    const tiny = computeTargets({ ...base, sex: "female", weightKg: 40, heightCm: 130, goal: "lose", activity: "sedentary" });
    expect(tiny.kcal).toBeGreaterThanOrEqual(1200);
  });
  it("gives under-18s no deficit", () => {
    const teen = { ...base, age: 16 };
    expect(computeTargets({ ...teen, goal: "lose" }).kcal).toBe(computeTargets(teen).kcal);
  });
  it("macros roughly add up to kcal", () => {
    const t = computeTargets(base);
    expect(Math.abs(t.proteinG * 4 + t.carbsG * 4 + t.fatG * 9 - t.kcal)).toBeLessThan(15);
  });
  it("converts units and validates", () => {
    expect(cmToFtIn(ftInToCm(5, 11))).toEqual({ ft: 5, inch: 11 });
    expect(validateProfile({ ...base, age: 5 })).toMatch(/Age/);
    expect(validateProfile(base)).toBeNull();
  });
});
