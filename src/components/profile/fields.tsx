"use client";
import { motion } from "motion/react";
import { useReducedMotion } from "@/components/fx";
import type { Activity, Equipment, Goal, Sex } from "@/lib/types";
import type { DraftFields } from "./draft";

export const GOALS: { v: Goal; label: string; sub: string; bg: string }[] = [
  { v: "lose", label: "Lose fat", sub: "Gentle deficit, high protein", bg: "bg-tangerine" },
  { v: "maintain", label: "Stay steady", sub: "Hold your weight, build habits", bg: "bg-teal" },
  { v: "gain", label: "Build muscle", sub: "Small surplus, lots of lifting", bg: "bg-sun" },
];
export const ACTS: { v: Activity; label: string; sub: string }[] = [
  { v: "sedentary", label: "Mostly sitting", sub: "Desk or couch most days" },
  { v: "light", label: "Light", sub: "1-3 workouts a week" },
  { v: "moderate", label: "Moderate", sub: "3-5 workouts a week" },
  { v: "high", label: "High", sub: "6+ workouts a week" },
];
export const EQUIP: Equipment[] = ["bodyweight", "dumbbell", "barbell", "cable", "machine", "band"];

export const spring = { type: "spring", stiffness: 340, damping: 26 } as const;

type Patch = (p: Partial<DraftFields>) => void;
interface Props { f: DraftFields; set: Patch; idPrefix?: string }
const LEGEND = "mb-3 font-display text-3xl font-extrabold tracking-tight";

export function Check() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-7 shrink-0">
      <circle cx="12" cy="12" r="11" fill="#fff" stroke="#0b1f1d" strokeWidth="2" />
      <path d="M7 12.5l3.5 3.5L17 9" fill="none" stroke="#0b1f1d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UnitsToggle({ imperial, onChange }: { imperial: boolean; onChange: (imperial: boolean) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Units">
      <button type="button" className="chip !min-h-[44px] !normal-case" aria-pressed={!imperial} onClick={() => onChange(false)}>kg and cm</button>
      <button type="button" className="chip !min-h-[44px] !normal-case" aria-pressed={imperial} onClick={() => onChange(true)}>lb and ft</button>
    </div>
  );
}

export function NameField({ f, set, idPrefix = "" }: Props) {
  return (
    <div className="min-w-0">
      <label className="lbl" htmlFor={`${idPrefix}name`}>First name</label>
      <input id={`${idPrefix}name`} className="field !min-h-[60px] !text-xl" value={f.name} onChange={(e) => set({ name: e.target.value })} autoComplete="given-name" />
    </div>
  );
}

export function SexPicker({ f, set }: Props) {
  const reduce = useReducedMotion();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-1.5 text-[.9rem] font-bold">Sex used for the formula</legend>
      <div className="flex flex-wrap gap-2">
        {(["female", "male", "other"] as Sex[]).map((s) => (
          <motion.button type="button" key={s} aria-pressed={f.sex === s} className="chip !min-h-[44px] !normal-case" onClick={() => set({ sex: s })} whileTap={reduce ? undefined : { scale: 0.9 }}>
            {s === "other" ? "Prefer not to say" : s[0].toUpperCase() + s.slice(1)}
          </motion.button>
        ))}
      </div>
    </fieldset>
  );
}

/** Age, height and weight inputs in the chosen unit system. */
export function BodyNumbers({ f, set, idPrefix = "", invalid }: Props & { invalid?: "age" | "height" | "weight" | null }) {
  const inv = (k: "age" | "height" | "weight") => (invalid === k ? { "aria-invalid": true as const, "aria-describedby": `${idPrefix}body-err` } : {});
  return (
    <div className="grid min-w-0 grid-cols-2 gap-4 md:grid-cols-3">
      <div className="min-w-0"><label className="lbl" htmlFor={`${idPrefix}age`}>Age</label><input id={`${idPrefix}age`} className="field" inputMode="numeric" value={f.age} onChange={(e) => set({ age: e.target.value })} {...inv("age")} /></div>
      {f.imperial ? (
        <>
          <div className="min-w-0"><label className="lbl" htmlFor={`${idPrefix}ft`}>Height (ft)</label><input id={`${idPrefix}ft`} className="field" inputMode="numeric" value={f.ft} onChange={(e) => set({ ft: e.target.value })} {...inv("height")} /></div>
          <div className="min-w-0"><label className="lbl" htmlFor={`${idPrefix}in`}>Height (in)</label><input id={`${idPrefix}in`} className="field" inputMode="numeric" value={f.inch} onChange={(e) => set({ inch: e.target.value })} {...inv("height")} /></div>
        </>
      ) : (
        <div className="min-w-0"><label className="lbl" htmlFor={`${idPrefix}cm`}>Height (cm)</label><input id={`${idPrefix}cm`} className="field" inputMode="numeric" value={f.cm} onChange={(e) => set({ cm: e.target.value })} {...inv("height")} /></div>
      )}
      <div className="min-w-0"><label className="lbl" htmlFor={`${idPrefix}wt`}>Weight ({f.imperial ? "lb" : "kg"})</label><input id={`${idPrefix}wt`} className="field" inputMode="decimal" value={f.wt} onChange={(e) => set({ wt: e.target.value })} {...inv("weight")} /></div>
    </div>
  );
}

export function GoalPicker({ f, set, legend = "What are you after?", legendClass = LEGEND }: Props & { legend?: string; legendClass?: string }) {
  const reduce = useReducedMotion();
  return (
    <fieldset className="min-w-0">
      <legend className={legendClass}>{legend}</legend>
      <div className="grid min-w-0 gap-3 md:grid-cols-3">
        {GOALS.map((g) => {
          const on = f.goal === g.v;
          return (
            <motion.button type="button" key={g.v} aria-pressed={on} onClick={() => set({ goal: g.v })} whileTap={reduce ? undefined : { scale: 0.96 }}
              animate={reduce ? undefined : { y: on ? -6 : 0, rotate: on ? -1 : 0 }} transition={spring}
              className={`relative min-h-28 min-w-0 rounded-[28px] border-2 border-ink p-5 text-left text-ink ${on ? g.bg + " shadow-[6px_6px_0_var(--ink)]" : "bg-surface hover:bg-bg"}`}>
              <span className="flex items-start justify-between gap-2"><b className="font-display text-2xl font-extrabold">{g.label}</b>{on && <Check />}</span>
              <span className="mt-1 block font-medium">{g.sub}</span>
            </motion.button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function ActivityPicker({ f, set, legend = "How active are you?", legendClass = LEGEND, onColor = "bg-bubble" }: Props & { legend?: string; legendClass?: string; onColor?: string }) {
  const reduce = useReducedMotion();
  return (
    <fieldset className="min-w-0">
      <legend className={legendClass}>{legend}</legend>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
        {ACTS.map((a) => {
          const on = f.activity === a.v;
          return (
            <motion.button type="button" key={a.v} aria-pressed={on} onClick={() => set({ activity: a.v })} whileTap={reduce ? undefined : { scale: 0.96 }}
              animate={reduce ? undefined : { y: on ? -4 : 0 }} transition={spring}
              className={`flex min-h-[72px] min-w-0 items-center justify-between gap-3 rounded-3xl border-2 border-ink p-4 text-left text-ink ${on ? `${onColor} shadow-[5px_5px_0_var(--ink)]` : "bg-surface hover:bg-bg"}`}>
              <span className="min-w-0"><b className="block text-lg">{a.label}</b><span className="font-medium">{a.sub}</span></span>
              {on && <Check />}
            </motion.button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function EquipmentPicker({ f, set, legend = "Equipment you can use", legendClass = LEGEND }: Props & { legend?: string; legendClass?: string }) {
  const reduce = useReducedMotion();
  const toggle = (e: Equipment) => set({ equipment: f.equipment.includes(e) ? f.equipment.filter((y) => y !== e) : [...f.equipment, e] });
  return (
    <fieldset className="min-w-0">
      <legend className={legendClass}>{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {EQUIP.map((e) => (
          <motion.button type="button" key={e} className="chip !min-h-[48px] !px-5" aria-pressed={f.equipment.includes(e)} whileTap={reduce ? undefined : { scale: 0.88 }}
            onClick={() => toggle(e)}>{e}</motion.button>
        ))}
      </div>
    </fieldset>
  );
}
