import { cmToFtIn, ftInToCm, kgToLb, lbToKg } from "../../lib/goals";
import type { Activity, Equipment, Goal, Profile, Sex } from "../../lib/types";

/** The editable form state for a profile: numbers stay as typed strings until saved. */
export interface DraftFields {
  imperial: boolean;
  name: string;
  sex: Sex;
  age: string;
  cm: string;
  ft: string;
  inch: string;
  wt: string;
  goal: Goal;
  activity: Activity;
  equipment: Equipment[];
}

export const ONBOARDING_DEFAULTS: DraftFields = {
  imperial: false, name: "", sex: "female", age: "28", cm: "170", ft: "5", inch: "7", wt: "68",
  goal: "maintain", activity: "light", equipment: ["bodyweight", "dumbbell"],
};

/** Up to one decimal, no trailing ".0". */
export const fmt1 = (n: number) => String(Math.round(n * 10) / 10);

export function fieldsFromProfile(p: Profile): DraftFields {
  const imperial = p.units === "imperial";
  const { ft, inch } = cmToFtIn(p.heightCm);
  return {
    imperial, name: p.name, sex: p.sex, age: String(p.age),
    cm: String(Math.round(p.heightCm)), ft: String(ft), inch: String(inch),
    wt: imperial ? fmt1(kgToLb(p.weightKg)) : fmt1(p.weightKg),
    goal: p.goal, activity: p.activity, equipment: [...p.equipment],
  };
}

const num = (s: string) => (s.trim() === "" ? NaN : Number(s.replace(",", ".")));

/**
 * Turn form fields into a Profile. When editing, pass the saved profile and the fields it
 * started from: untouched height/weight keep their exact stored values so unit rounding
 * never drifts them.
 */
export function buildProfile(f: DraftFields, base?: Profile | null, initial?: DraftFields | null): Profile {
  const sameUnits = !!initial && initial.imperial === f.imperial;
  const heightSame = !!base && sameUnits && (f.imperial ? f.ft === initial!.ft && f.inch === initial!.inch : f.cm === initial!.cm);
  const weightSame = !!base && sameUnits && f.wt === initial!.wt;
  const heightCm = heightSame ? base!.heightCm : f.imperial ? ftInToCm(num(f.ft), num(f.inch)) : num(f.cm);
  const weightKg = weightSame ? base!.weightKg : f.imperial ? lbToKg(num(f.wt)) : num(f.wt);
  return {
    ...(base ?? {}),
    name: f.name.trim() || "friend", sex: f.sex, age: num(f.age),
    heightCm, weightKg,
    goal: f.goal, activity: f.activity,
    equipment: f.equipment.length ? f.equipment : ["bodyweight"],
    units: f.imperial ? "imperial" : "metric",
  };
}

/** Convert the typed height and weight when the unit system changes. */
export function switchUnits(f: DraftFields, next: boolean, base?: Profile | null, initial?: DraftFields | null): DraftFields {
  if (next === f.imperial) return f;
  // Switching back to the saved units: restore the original text for anything not edited meanwhile.
  if (initial && next === initial.imperial) {
    const conv = switchUnits(initial, !initial.imperial, base, initial);
    const heightUntouched = f.imperial ? f.ft === conv.ft && f.inch === conv.inch : f.cm === conv.cm;
    const weightUntouched = f.wt === conv.wt;
    if (heightUntouched && weightUntouched) return { ...f, imperial: next, cm: initial.cm, ft: initial.ft, inch: initial.inch, wt: initial.wt };
  }
  const p = buildProfile(f, base, initial);
  if (next) {
    const { ft, inch } = cmToFtIn(p.heightCm);
    return { ...f, imperial: true, ft: String(ft), inch: String(inch), wt: fmt1(kgToLb(p.weightKg)) };
  }
  return { ...f, imperial: false, cm: String(Math.round(p.heightCm)), wt: fmt1(p.weightKg) };
}

/** True when the form differs from where it started. */
export function isDirty(f: DraftFields, initial: DraftFields): boolean {
  const norm = (x: DraftFields) => {
    const height = x.imperial ? { ft: x.ft.trim(), inch: x.inch.trim() } : { cm: x.cm.trim() };
    return JSON.stringify([x.imperial, x.name.trim(), x.sex, x.age.trim(), height, x.wt.trim(), x.goal, x.activity, [...x.equipment].sort()]);
  };
  return norm(f) !== norm(initial);
}
