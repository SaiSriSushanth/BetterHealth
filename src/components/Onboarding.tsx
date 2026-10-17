"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "./AppProvider";
import { CountUp, burst, useReducedMotion } from "@/components/fx";
import { computeTargets, cmToFtIn, ftInToCm, kgToLb, lbToKg, validateProfile } from "@/lib/goals";
import type { Activity, Equipment, Goal, Profile, Sex, Targets } from "@/lib/types";

const GOALS: { v: Goal; label: string; sub: string; bg: string }[] = [
  { v: "lose", label: "Lose fat", sub: "Gentle deficit, high protein", bg: "bg-tangerine" },
  { v: "maintain", label: "Stay steady", sub: "Hold your weight, build habits", bg: "bg-teal" },
  { v: "gain", label: "Build muscle", sub: "Small surplus, lots of lifting", bg: "bg-sun" },
];
const ACTS: { v: Activity; label: string; sub: string }[] = [
  { v: "sedentary", label: "Mostly sitting", sub: "Desk or couch most days" },
  { v: "light", label: "Light", sub: "1-3 workouts a week" },
  { v: "moderate", label: "Moderate", sub: "3-5 workouts a week" },
  { v: "high", label: "High", sub: "6+ workouts a week" },
];
const EQUIP: Equipment[] = ["bodyweight", "dumbbell", "barbell", "cable", "machine", "band"];

const spring = { type: "spring", stiffness: 340, damping: 26 } as const;

function Check() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-7 shrink-0">
      <circle cx="12" cy="12" r="11" fill="#fff" stroke="#0b1f1d" strokeWidth="2" />
      <path d="M7 12.5l3.5 3.5L17 9" fill="none" stroke="#0b1f1d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Steps({ step }: { step: 0 | 1 }) {
  return (
    <div className="flex items-center gap-3" role="group" aria-label={`Step ${step + 1} of 2`}>
      <div className="flex flex-1 gap-2" aria-hidden>
        {[0, 1].map((i) => (
          <div key={i} className="h-3 flex-1 overflow-hidden rounded-full bg-ink/15">
            <motion.div className="h-full rounded-full bg-tangerine" initial={false} animate={{ width: i <= step ? "100%" : "0%" }} transition={{ type: "spring", stiffness: 120, damping: 18 }} />
          </div>
        ))}
      </div>
      <span className="text-sm font-bold">Step {step + 1} of 2</span>
    </div>
  );
}

function PlateReveal({ p, t, saving, err, onFinish, onBack }: { p: Profile; t: Targets; saving: boolean; err: string | null; onFinish: () => void; onBack: () => void }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    const id = setTimeout(() => burst(), 450);
    return () => clearTimeout(id);
  }, []);
  const tiles = [
    { l: "protein", v: t.proteinG, c: "block-teal" },
    { l: "carbs", v: t.carbsG, c: "block-sun" },
    { l: "fat", v: t.fatG, c: "block-bubble" },
  ];
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
      <Steps step={1} />
      <h1 className="break-words text-[clamp(2.2rem,1rem+6vw,4.5rem)]">Your daily plate, {p.name}.</h1>
      <div className="block block-lime mesh relative p-6 md:p-10">
        <p className="display text-[clamp(5.5rem,2rem+22vw,13rem)] leading-[.8] tracking-tighter"><CountUp value={t.kcal} duration={1.4} /></p>
        <p className="mt-3 text-xl font-bold md:text-2xl">calories a day</p>
      </div>
      <ul className="grid grid-cols-3 gap-3 text-center">
        {tiles.map((x, i) => (
          <motion.li key={x.l} initial={reduce ? false : { opacity: 0, scale: 0.4, rotate: i % 2 ? 8 : -8 }} animate={{ opacity: 1, scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 14, delay: 0.5 + i * 0.12 }}
            className={`block ${x.c} min-w-0 p-3 [overflow-wrap:anywhere] md:p-5`}>
            <b className="display block text-3xl md:text-5xl">{x.v}g</b><span className="font-bold">{x.l}</span>
          </motion.li>
        ))}
      </ul>
      <p className="max-w-prose text-ink2">
        Worked out with the Mifflin-St Jeor formula from your height, weight, age and activity. It&apos;s a starting point, and you can change your answers any time.
      </p>
      {err && <p role="alert" className="rounded-2xl bg-bubble px-4 py-2 font-bold">{err}</p>}
      <div className="flex flex-wrap gap-3">
        <motion.button className="btn hot !min-h-[60px] !px-8 !text-lg" onClick={onFinish} disabled={saving} whileTap={reduce ? undefined : { scale: 0.94 }}>Start tracking</motion.button>
        <button className="btn secondary" onClick={onBack}>Change my answers</button>
      </div>
    </div>
  );
}

export function Onboarding() {
  const { saveProfile } = useApp();
  const reduce = useReducedMotion();
  const [step, setStep] = useState<0 | 1>(0);
  const [imperial, setImperial] = useState(false);
  const [name, setName] = useState("");
  const [sex, setSex] = useState<Sex>("female");
  const [age, setAge] = useState("28");
  const [cm, setCm] = useState("170");
  const [ft, setFt] = useState("5");
  const [inch, setInch] = useState("7");
  const [wt, setWt] = useState("68");
  const [goal, setGoal] = useState<Goal>("maintain");
  const [activity, setActivity] = useState<Activity>("light");
  const [equipment, setEquipment] = useState<Equipment[]>(["bodyweight", "dumbbell"]);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function build(): Profile {
    return {
      name: name.trim() || "friend", sex, age: Number(age),
      heightCm: imperial ? ftInToCm(Number(ft), Number(inch)) : Number(cm),
      weightKg: imperial ? lbToKg(Number(wt)) : Number(wt),
      goal, activity, equipment: equipment.length ? equipment : ["bodyweight"],
      units: imperial ? "imperial" : "metric",
    };
  }
  function toggleUnits(next: boolean) {
    if (next === imperial) return;
    const p = build();
    if (next) {
      const f = cmToFtIn(p.heightCm); setFt(String(f.ft)); setInch(String(f.inch)); setWt(String(Math.round(kgToLb(p.weightKg))));
    } else {
      setCm(String(Math.round(p.heightCm))); setWt(String(Math.round(p.weightKg)));
    }
    setImperial(next);
  }
  function next() {
    const p = build();
    const bad = validateProfile(p);
    setErr(bad);
    if (!bad) setStep(1);
  }
  async function finish() {
    setSaving(true);
    try { await saveProfile(build()); } catch (e) { setErr(e instanceof Error ? e.message : "Could not save. Try again."); setSaving(false); }
  }

  const slide = reduce ? { initial: false as const, exit: { opacity: 0 } } : {
    initial: { opacity: 0, x: 80, scale: 0.97 }, animate: { opacity: 1, x: 0, scale: 1 }, exit: { opacity: 0, x: -80, scale: 0.97 },
  };

  return (
    <AnimatePresence mode="wait" initial={false}>
      {step === 1 ? (
        <motion.section key="plate" {...slide} transition={spring}>
          <PlateReveal p={build()} t={computeTargets(build())} saving={saving} err={err} onFinish={finish} onBack={() => setStep(0)} />
        </motion.section>
      ) : (
        <motion.section key="form" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6" {...slide} transition={spring}>
          <Steps step={0} />
          <div>
            <h1 className="text-[clamp(2.6rem,1rem+9vw,6.5rem)] leading-[.88]">Let&apos;s set your daily plate</h1>
            <p className="mt-3 max-w-prose text-lg text-ink2">Six quick answers and we&apos;ll work out calories and macros for you. Stays on this device until you sign in.</p>
          </div>

          <div className="card grid min-w-0 gap-6 p-5 md:p-8">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Units">
              <button className="chip !normal-case" aria-pressed={!imperial} onClick={() => toggleUnits(false)}>kg and cm</button>
              <button className="chip !normal-case" aria-pressed={imperial} onClick={() => toggleUnits(true)}>lb and ft</button>
            </div>
            <div><label className="lbl" htmlFor="name">First name</label><input id="name" className="field !min-h-[60px] !text-xl" value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></div>
            <fieldset className="min-w-0">
              <legend className="mb-1.5 text-[.9rem] font-bold">Sex used for the formula</legend>
              <div className="flex flex-wrap gap-2">
                {(["female", "male", "other"] as Sex[]).map((s) => (
                  <motion.button key={s} aria-pressed={sex === s} className="chip !normal-case" onClick={() => setSex(s)} whileTap={reduce ? undefined : { scale: 0.9 }}>{s === "other" ? "Prefer not to say" : s[0].toUpperCase() + s.slice(1)}</motion.button>
                ))}
              </div>
            </fieldset>
            <div className="grid min-w-0 grid-cols-2 gap-4 md:grid-cols-3">
              <div className="min-w-0"><label className="lbl" htmlFor="age">Age</label><input id="age" className="field" inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} /></div>
              {imperial ? (
                <>
                  <div className="min-w-0"><label className="lbl" htmlFor="ft">Height (ft)</label><input id="ft" className="field" inputMode="numeric" value={ft} onChange={(e) => setFt(e.target.value)} /></div>
                  <div className="min-w-0"><label className="lbl" htmlFor="in">Height (in)</label><input id="in" className="field" inputMode="numeric" value={inch} onChange={(e) => setInch(e.target.value)} /></div>
                </>
              ) : (
                <div className="min-w-0"><label className="lbl" htmlFor="cm">Height (cm)</label><input id="cm" className="field" inputMode="numeric" value={cm} onChange={(e) => setCm(e.target.value)} /></div>
              )}
              <div className="min-w-0"><label className="lbl" htmlFor="wt">Weight ({imperial ? "lb" : "kg"})</label><input id="wt" className="field" inputMode="decimal" value={wt} onChange={(e) => setWt(e.target.value)} /></div>
            </div>
          </div>

          <fieldset className="min-w-0">
            <legend className="mb-3 font-display text-3xl font-extrabold tracking-tight">What are you after?</legend>
            <div className="grid min-w-0 gap-3 md:grid-cols-3">
              {GOALS.map((g) => {
                const on = goal === g.v;
                return (
                  <motion.button key={g.v} aria-pressed={on} onClick={() => setGoal(g.v)} whileTap={reduce ? undefined : { scale: 0.96 }}
                    animate={reduce ? undefined : { y: on ? -6 : 0, rotate: on ? -1 : 0 }} transition={spring}
                    className={`relative min-h-28 min-w-0 rounded-[28px] border-2 border-ink p-5 text-left text-ink ${on ? g.bg + " shadow-[6px_6px_0_var(--ink)]" : "bg-surface hover:bg-bg"}`}>
                    <span className="flex items-start justify-between gap-2"><b className="font-display text-2xl font-extrabold">{g.label}</b>{on && <Check />}</span>
                    <span className="mt-1 block font-medium">{g.sub}</span>
                  </motion.button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="mb-3 font-display text-3xl font-extrabold tracking-tight">How active are you?</legend>
            <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
              {ACTS.map((a) => {
                const on = activity === a.v;
                return (
                  <motion.button key={a.v} aria-pressed={on} onClick={() => setActivity(a.v)} whileTap={reduce ? undefined : { scale: 0.96 }}
                    animate={reduce ? undefined : { y: on ? -4 : 0 }} transition={spring}
                    className={`flex min-h-[72px] min-w-0 items-center justify-between gap-3 rounded-3xl border-2 border-ink p-4 text-left text-ink ${on ? "bg-bubble shadow-[5px_5px_0_var(--ink)]" : "bg-surface hover:bg-bg"}`}>
                    <span className="min-w-0"><b className="block text-lg">{a.label}</b><span className="font-medium">{a.sub}</span></span>
                    {on && <Check />}
                  </motion.button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="min-w-0">
            <legend className="mb-3 font-display text-3xl font-extrabold tracking-tight">Equipment you can use</legend>
            <div className="flex flex-wrap gap-2">
              {EQUIP.map((e) => (
                <motion.button key={e} className="chip !min-h-[48px] !px-5" aria-pressed={equipment.includes(e)} whileTap={reduce ? undefined : { scale: 0.88 }}
                  onClick={() => setEquipment((x) => (x.includes(e) ? x.filter((y) => y !== e) : [...x, e]))}>{e}</motion.button>
              ))}
            </div>
          </fieldset>

          {err && <p role="alert" className="rounded-2xl bg-bubble px-4 py-2 font-bold">{err}</p>}
          <div><motion.button className="btn hot !min-h-[64px] !px-10 !text-xl" onClick={next} whileTap={reduce ? undefined : { scale: 0.94 }}>Show my plate</motion.button></div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
