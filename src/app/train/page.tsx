"use client";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/components/AppProvider";
import { BodyMap } from "@/components/BodyMap";
import { Reveal, burst, useWebGL } from "@/components/fx";
import { EXERCISES, MUSCLES, MUSCLE_BY_ID } from "@/lib/exercises";
import { lastDays, musclesTrained } from "@/lib/day";
import { kgToLb, lbToKg } from "@/lib/goals";
import type { Difficulty, Equipment, WorkoutEntry } from "@/lib/types";

const BodyViewer = dynamic(() => import("@/components/three/BodyViewer").then((m) => m.BodyViewer), { ssr: false });

const DIFF: Record<Difficulty, { label: string; bg: string }> = {
  beginner: { label: "Beginner", bg: "bg-lime" },
  intermediate: { label: "Intermediate", bg: "bg-sun" },
  advanced: { label: "Advanced", bg: "bg-bubble" },
};
const ALL_EQUIP: Equipment[] = ["bodyweight", "dumbbell", "barbell", "cable", "machine", "band"];
const AREA_BG: Record<string, string> = { upper: "block-tangerine", arms: "block-bubble", core: "block-sun", lower: "block-teal" };

export default function TrainPage() {
  const { ready, today, profile, workouts, addWorkout, cloud } = useApp();
  const gl = useWebGL();
  const [sel, setSel] = useState<string | null>(null);
  const [side, setSide] = useState<"front" | "back">("front");
  const [equip, setEquip] = useState<Equipment[] | null>(null);
  const [draft, setDraft] = useState<WorkoutEntry[]>([]);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const imperial = profile?.units === "imperial";
  const trained = useMemo(() => (today ? musclesTrained(workouts, lastDays(today)) : new Set<string>()), [workouts, today]);
  if (!ready || !today) return <div role="status" aria-label="Loading" className="block block-teal h-72 animate-pulse" />;

  const myEquip = equip ?? profile?.equipment ?? ALL_EQUIP;
  const muscle = sel ? MUSCLE_BY_ID[sel] : null;
  const list = sel ? EXERCISES.filter((e) => e.muscleId === sel && myEquip.includes(e.equipment)) : [];

  function add(id: string, el?: HTMLElement) {
    const ex = EXERCISES.find((e) => e.id === id)!;
    setDraft((d) => [...d, { exerciseId: ex.id, name: ex.name, muscleId: ex.muscleId, sets: [{ reps: 10, weightKg: 0 }, { reps: 10, weightKg: 0 }, { reps: 10, weightKg: 0 }] }]);
    setNote(null);
    if (el) { const r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 14); }
  }
  function patch(i: number, j: number, k: "reps" | "weightKg", v: number) {
    setDraft((d) => d.map((e, ei) => ei !== i ? e : { ...e, sets: e.sets.map((s, si) => si !== j ? s : { ...s, [k]: v }) }));
  }
  async function save() {
    if (!draft.length) return;
    await addWorkout({ title: title.trim() || `${MUSCLE_BY_ID[draft[0].muscleId]?.label ?? "Full body"} day`, entries: draft });
    setDraft([]); setTitle(""); setNote("Workout saved. Those muscles are coloured in now.");
    burst();
  }
  async function generate() {
    if (!sel) { setNote("Tap a muscle first, then I'll build around it."); return; }
    setBusy(true); setNote(null);
    try {
      const r = await fetch("/api/workout/generate", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ muscles: [sel], equipment: myEquip, level: "intermediate", minutes: 30 }) });
      const j = await r.json();
      if (j.blocks) {
        setTitle(j.title);
        setDraft(j.blocks.flatMap((b: { exerciseId: string; sets: number; reps: number }) => {
          const ex = EXERCISES.find((e) => e.id === b.exerciseId);
          return ex ? [{ exerciseId: ex.id, name: ex.name, muscleId: ex.muscleId, sets: Array.from({ length: b.sets }, () => ({ reps: b.reps, weightKg: 0 })) }] : [];
        }));
      } else setNote(j.error ?? "AI could not build that.");
    } catch { setNote("Could not reach the AI. Pick moves from the list instead."); }
    setBusy(false);
  }

  const recent = [...workouts].reverse().slice(0, 5);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h1>Pick a muscle.</h1>
        <p className="sticker">{trained.size} of {MUSCLES.length} trained this week</p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,460px)_minmax(0,1fr)]">
        <section className="block block-teal mesh grain relative p-3 lg:sticky lg:top-6 lg:self-start" aria-label="Body map">
          {gl ? (
            <div className="relative h-[460px] md:h-[560px]">
              <BodyViewer className="absolute inset-0" trained={trained} selected={sel} onSelect={setSel} />
              <p className="pointer-events-none absolute inset-x-0 bottom-2 text-center text-sm font-bold">Drag to spin. Tap a muscle.</p>
            </div>
          ) : (
            <>
              <div className="mb-3 flex justify-center gap-2 sm:hidden" role="group" aria-label="Body side">
                <button className="chip" aria-pressed={side === "front"} onClick={() => setSide("front")}>Front</button>
                <button className="chip" aria-pressed={side === "back"} onClick={() => setSide("back")}>Back</button>
              </div>
              <div className="mx-auto grid max-w-[230px] gap-2 sm:max-w-none sm:grid-cols-2">
                <div className={side === "front" ? "block-wrap" : "hidden sm:block"}><BodyMap view="front" muscles={MUSCLES} trained={trained} selected={sel} onSelect={setSel} /></div>
                <div className={side === "back" ? "block-wrap" : "hidden sm:block"}><BodyMap view="back" muscles={MUSCLES} trained={trained} selected={sel} onSelect={setSel} /></div>
              </div>
            </>
          )}
        </section>

        <section className="grid min-w-0 content-start gap-4">
          <p role="status" className="sr-only">{muscle ? `${muscle.label} selected, ${list.length} moves` : ""}</p>
          <div className="flex flex-wrap gap-2" role="group" aria-label="All muscles">
            {MUSCLES.map((m) => (
              <button key={m.id} className="chip" aria-pressed={sel === m.id} onClick={() => setSel(m.id)}>
                {m.label}{trained.has(m.id) ? " ✓" : ""}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {!muscle ? (
              <motion.p key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="card p-6 text-lg font-semibold text-muted">
                Tap the body or a muscle name to see moves for it.
              </motion.p>
            ) : (
              <motion.div key={muscle.id} initial={{ opacity: 0, y: 20, rotateX: -8 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} exit={{ opacity: 0, y: -10 }}
                transition={{ type: "spring", stiffness: 180, damping: 18 }} className="card overflow-hidden">
                <div className={`block ${AREA_BG[muscle.area]} rounded-b-none p-5 md:p-6`}>
                  <h2 className="mega !text-[clamp(2.5rem,1rem+7vw,4.5rem)]">{muscle.label}</h2>
                  <p className="mt-2 font-medium">Includes {muscle.includes.join(", ")}.</p>
                </div>
                <div className="p-5 md:p-6">
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Equipment filter">
                    {ALL_EQUIP.map((e) => (
                      <button key={e} className="chip !min-h-10 text-sm" aria-pressed={myEquip.includes(e)}
                        onClick={() => setEquip(myEquip.includes(e) ? myEquip.filter((x) => x !== e) : [...myEquip, e])}>{e}</button>
                    ))}
                  </div>
                  {list.length === 0 ? (
                    <p className="mt-4 font-bold">Nothing matches that equipment. Turn on bodyweight or another filter.</p>
                  ) : (
                    <ul className="mt-4 grid gap-1">
                      {list.map((e, i) => (
                        <motion.li key={e.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.05 + i * 0.05 }}
                          className="rowline flex items-start justify-between gap-3 py-3">
                          <div className="min-w-0">
                            <b className="text-lg">{e.name}</b>
                            <span className={`ml-2 rounded-full border-2 border-ink px-2 py-0.5 text-xs font-bold ${DIFF[e.difficulty].bg}`}>{DIFF[e.difficulty].label}</span>
                            <div className="text-sm font-semibold capitalize text-muted">{e.equipment}</div>
                            <div>{e.cue}</div>
                          </div>
                          <button className="btn !min-h-11 shrink-0" onClick={(ev) => add(e.id, ev.currentTarget)}>Add</button>
                        </motion.li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <button className="btn secondary" disabled={busy || !cloud} onClick={generate}>
                      {busy ? "Building…" : `Build a ${muscle.label.toLowerCase()} workout with AI`}
                    </button>
                    {!cloud && <span className="text-sm text-muted">Sign in to unlock AI workouts.</span>}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>

      <p role="status" className="block block-bubble p-4 font-semibold empty:hidden">{note}</p>

      <AnimatePresence>
        {draft.length > 0 && (
          <motion.section initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 200, damping: 20 }} className="block block-sun p-5 md:p-7" aria-label="Current workout">
            <h2>Your workout</h2>
            <div className="mt-3 max-w-sm"><label className="lbl" htmlFor="wt">Name it</label><input id="wt" className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Leg day" /></div>
            <ul className="mt-5 grid gap-4">
              <AnimatePresence initial={false}>
                {draft.map((en, i) => (
                  <motion.li key={`${en.exerciseId}-${i}`} layout initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 40, height: 0 }} className="rounded-3xl bg-surface p-4">
                    <div className="flex items-center justify-between"><b className="text-lg">{en.name}</b><button className="btn ghost !min-h-9" onClick={() => setDraft((d) => d.filter((_, x) => x !== i))}>Remove</button></div>
                    <div className="mt-2 grid gap-2">
                      {en.sets.map((s, j) => (
                        <div key={j} className="flex flex-wrap items-center gap-2">
                          <span className="w-14 font-bold">Set {j + 1}</span>
                          <label className="sr-only" htmlFor={`r${i}${j}`}>{en.name}, set {j + 1} reps</label>
                          <input id={`r${i}${j}`} className="field !w-20 !min-h-11" inputMode="numeric" value={s.reps} onChange={(e) => patch(i, j, "reps", Math.max(0, Math.min(100, Number(e.target.value) || 0)))} />
                          <span>reps ×</span>
                          <label className="sr-only" htmlFor={`w${i}${j}`}>{en.name}, set {j + 1} weight</label>
                          <input id={`w${i}${j}`} className="field !w-24 !min-h-11" inputMode="decimal"
                            value={imperial ? Math.round(kgToLb(s.weightKg) * 10) / 10 : s.weightKg}
                            onChange={(e) => { const n = Math.max(0, Number(e.target.value) || 0); patch(i, j, "weightKg", imperial ? lbToKg(n) : n); }} />
                          <span>{imperial ? "lb" : "kg"}</span>
                        </div>
                      ))}
                    </div>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
            <div className="mt-6"><button className="btn hot" onClick={save}>Save workout</button></div>
          </motion.section>
        )}
      </AnimatePresence>

      <section aria-label="Recent workouts" className="grid gap-3">
        <h2>Recent workouts</h2>
        {recent.length === 0 ? <p className="card p-5 font-semibold">No workouts yet. Add a few moves above and save them.</p> : recent.map((w, i) => {
          const sets = w.entries.reduce((s, e) => s + e.sets.length, 0);
          return (
            <Reveal key={w.id} delay={i * 0.04}>
              <div className="card flex flex-wrap items-baseline justify-between gap-2 p-4">
                <b className="text-lg">{w.title}</b>
                <span className="text-sm font-semibold text-muted">{w.day} · {w.entries.length} {w.entries.length === 1 ? "move" : "moves"}, {sets} {sets === 1 ? "set" : "sets"}</span>
              </div>
            </Reveal>
          );
        })}
      </section>
    </div>
  );
}
