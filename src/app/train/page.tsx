"use client";
import { useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/components/AppProvider";
import { BodyMap } from "@/components/BodyMap";
import { burst, useWebGL } from "@/components/fx";
import { WorkoutBuilder } from "@/components/train/WorkoutBuilder";
import { WorkoutHistory } from "@/components/train/WorkoutHistory";
import { entryFrom, entryFromHistory, type KeyedEntry, withKeys } from "@/components/train/shared";
import { EXERCISES, MUSCLES, MUSCLE_BY_ID } from "@/lib/exercises";
import { lastDays, musclesTrained } from "@/lib/day";
import { cloneEntries, friendlyDay } from "@/lib/workouts";
import type { Difficulty, Equipment, WorkoutLog } from "@/lib/types";

const BodyViewer = dynamic(() => import("@/components/three/BodyViewer").then((m) => m.BodyViewer), { ssr: false });

const DIFF: Record<Difficulty, { label: string; bg: string }> = {
  beginner: { label: "Beginner", bg: "bg-lime" },
  intermediate: { label: "Intermediate", bg: "bg-sun" },
  advanced: { label: "Advanced", bg: "bg-bubble" },
};
const ALL_EQUIP: Equipment[] = ["bodyweight", "dumbbell", "barbell", "cable", "machine", "band"];
const AREA_BG: Record<string, string> = { upper: "block-tangerine", arms: "block-bubble", core: "block-sun", lower: "block-teal" };

export default function TrainPage() {
  const { ready, today, profile, workouts, addWorkout, updateWorkout, deleteWorkout, cloud } = useApp();
  const gl = useWebGL();
  const [sel, setSel] = useState<string | null>(null);
  const [side, setSide] = useState<"front" | "back">("front");
  const [equip, setEquip] = useState<Equipment[] | null>(null);
  const [draft, setDraft] = useState<KeyedEntry[]>([]);
  const [day, setDay] = useState<string | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const builderRef = useRef<HTMLHeadingElement>(null);
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
    setDraft((d) => [...d, entryFromHistory(ex, workouts)]);
    setNote(null);
    if (el) { const r = el.getBoundingClientRect(); burst(r.left + r.width / 2, r.top + r.height / 2, 14); }
  }
  const draftDay = day ?? today;
  function showBuilder() {
    setBuilderOpen(true);
    requestAnimationFrame(() => { builderRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); builderRef.current?.focus({ preventScroll: true }); });
  }
  function clearBuilder() { setDraft([]); setTitle(""); setDay(null); setBuilderOpen(false); }
  async function save(w: Pick<WorkoutLog, "title" | "day" | "entries">) {
    const name = w.title.trim() || `${MUSCLE_BY_ID[w.entries[0].muscleId]?.label ?? "Full body"} day`;
    await addWorkout({ title: name, entries: w.entries, day: w.day });
    clearBuilder();
    setNote(w.day === today ? "Workout saved. Those muscles are coloured in now." : `Saved for ${friendlyDay(w.day, today)}. It is in your history below.`);
    burst();
  }
  function repeat(w: WorkoutLog) {
    setDraft(withKeys(cloneEntries(w.entries))); setTitle(w.title); setDay(today);
    setNote(`Copied ${w.title} with the same sets and weights. Adjust it, then save.`);
    showBuilder();
  }
  function logPast() {
    const [y, m, d] = today.split("-").map(Number);
    const dt = new Date(y, m - 1, d - 1);
    setDay(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`);
    setNote(null);
    showBuilder();
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
          return ex ? [entryFrom(ex, b.sets, b.reps)] : [];
        }));
      } else setNote(j.error ?? "AI could not build that.");
    } catch { setNote("Could not reach the AI. Pick moves from the list instead."); }
    setBusy(false);
  }

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
        {(draft.length > 0 || builderOpen) && (
          <WorkoutBuilder key="builder" headRef={builderRef} entries={draft} setEntries={setDraft} title={title} setTitle={setTitle}
            day={draftDay} setDay={setDay} today={today} imperial={imperial} history={workouts} onSave={save} onClear={clearBuilder} />
        )}
      </AnimatePresence>

      <WorkoutHistory workouts={workouts} today={today} imperial={imperial} draftHasMoves={draft.length > 0}
        onUpdate={updateWorkout} onDelete={deleteWorkout}
        onRestore={async (w) => { await addWorkout({ title: w.title, entries: cloneEntries(w.entries), day: w.day }); }}
        onRepeat={repeat} onLogPast={logPast} />
    </div>
  );
}
