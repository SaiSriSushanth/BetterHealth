"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "./AppProvider";
import { CountUp, burst, useReducedMotion } from "@/components/fx";
import { computeTargets, validateProfile } from "@/lib/goals";
import type { Profile, Targets } from "@/lib/types";
import { ONBOARDING_DEFAULTS, buildProfile, switchUnits, type DraftFields } from "./profile/draft";
import { ActivityPicker, BodyNumbers, EquipmentPicker, GoalPicker, NameField, SexPicker, UnitsToggle, spring } from "./profile/fields";

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
  const [f, setF] = useState<DraftFields>(ONBOARDING_DEFAULTS);
  const set = (patch: Partial<DraftFields>) => setF((x) => ({ ...x, ...patch }));
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const build = (): Profile => buildProfile(f);
  const toggleUnits = (next: boolean) => setF((x) => switchUnits(x, next));
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
            <UnitsToggle imperial={f.imperial} onChange={toggleUnits} />
            <NameField f={f} set={set} />
            <SexPicker f={f} set={set} />
            <BodyNumbers f={f} set={set} />
          </div>

          <GoalPicker f={f} set={set} />
          <ActivityPicker f={f} set={set} />
          <EquipmentPicker f={f} set={set} />

          {err && <p role="alert" className="rounded-2xl bg-bubble px-4 py-2 font-bold">{err}</p>}
          <div><motion.button className="btn hot !min-h-[64px] !px-10 !text-xl" onClick={next} whileTap={reduce ? undefined : { scale: 0.94 }}>Show my plate</motion.button></div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}
