import type { Activity, Profile, Targets } from "./types";

const ACTIVITY_FACTOR: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
};

export const LIMITS = {
  age: [13, 100],
  heightCm: [120, 230],
  weightKg: [30, 300],
} as const;

export function bmr(p: Pick<Profile, "sex" | "age" | "heightCm" | "weightKg">): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  const constant = p.sex === "male" ? 5 : p.sex === "female" ? -161 : -78; // "other": mean of the two
  return base + constant;
}

export function computeTargets(p: Profile): Targets {
  const tdee = bmr(p) * ACTIVITY_FACTOR[p.activity];
  const floor = p.sex === "male" ? 1500 : 1200;
  const minor = p.age < 18;
  let kcal = tdee;
  if (p.goal === "lose" && !minor) kcal = Math.max(tdee - 500, floor);
  if (p.goal === "gain") kcal = tdee + 300;
  kcal = Math.round(kcal / 10) * 10;
  const proteinG = Math.round(p.weightKg * (p.goal === "lose" ? 2.0 : 1.8));
  const fatG = Math.round((kcal * 0.25) / 9);
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  const fiberG = Math.round((kcal / 1000) * 14);
  return { kcal, proteinG, carbsG, fatG, fiberG };
}

export function validateProfile(p: Profile): string | null {
  const chk = (v: number, [lo, hi]: readonly [number, number], label: string) =>
    v < lo || v > hi || Number.isNaN(v) ? `${label} should be between ${lo} and ${hi}` : null;
  return (
    chk(p.age, LIMITS.age, "Age") ??
    chk(p.heightCm, LIMITS.heightCm, "Height (cm)") ??
    chk(p.weightKg, LIMITS.weightKg, "Weight (kg)")
  );
}

export const kgToLb = (kg: number) => kg * 2.2046226;
export const lbToKg = (lb: number) => lb / 2.2046226;
export const cmToFtIn = (cm: number) => {
  const total = cm / 2.54;
  let ft = Math.floor(total / 12);
  let inch = Math.round(total - ft * 12);
  if (inch === 12) { ft += 1; inch = 0; }
  return { ft, inch };
};
export const ftInToCm = (ft: number, inch: number) => (ft * 12 + inch) * 2.54;
