"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { WorkoutLog } from "@/lib/types";
import { groupByWeek } from "@/lib/workouts";
import { WorkoutCard } from "./WorkoutCard";
import { focusOnMount } from "./shared";

interface Props {
  workouts: WorkoutLog[];
  today: string;
  imperial: boolean;
  draftHasMoves: boolean;
  onUpdate(id: string, patch: Pick<WorkoutLog, "title" | "day" | "entries">): Promise<void>;
  onDelete(id: string): Promise<void>;
  /** re-adds a deleted workout with the same content and day */
  onRestore(w: WorkoutLog): Promise<void>;
  onRepeat(w: WorkoutLog): void;
  onLogPast(): void;
}

const UNDO_MS = 6000;
const WEEKS_STEP = 4;

export function WorkoutHistory({ workouts, today, imperial, draftHasMoves, onUpdate, onDelete, onRestore, onRepeat, onLogPast }: Props) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [weeks, setWeeks] = useState(WEEKS_STEP);
  const [undo, setUndo] = useState<{ w: WorkoutLog; n: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const [announce, setAnnounce] = useState("");
  const headRef = useRef<HTMLHeadingElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const groups = useMemo(() => groupByWeek(workouts, today), [workouts, today]);
  const shown = groups.slice(0, weeks);

  useEffect(() => {
    if (!undo || paused) return;
    const t = setTimeout(() => {
      if (toastRef.current?.contains(document.activeElement)) headRef.current?.focus();
      setUndo(null);
    }, UNDO_MS);
    return () => clearTimeout(t);
  }, [undo, paused]);

  const flip = (s: Set<string>, id: string, on?: boolean) => {
    const n = new Set(s);
    if (on ?? !n.has(id)) n.add(id); else n.delete(id);
    return n;
  };

  async function del(w: WorkoutLog) {
    await onDelete(w.id);
    setEditing((s) => flip(s, w.id, false));
    setUndo((u) => ({ w, n: (u?.n ?? 0) + 1 }));
    setPaused(false);
    setAnnounce(`Deleted ${w.title}. Undo is available for a few seconds.`);
  }
  async function restore() {
    if (!undo) return;
    const w = undo.w;
    setUndo(null);
    try { await onRestore(w); setAnnounce(`Restored ${w.title}.`); }
    catch { setAnnounce("Could not restore that workout. Check your connection."); }
    headRef.current?.focus();
  }

  const total = workouts.length;

  return (
    <section aria-labelledby="history-h" className="grid min-w-0 gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 id="history-h" ref={headRef} tabIndex={-1} className="outline-none">Workout history</h2>
          <p className="mt-1 font-semibold text-muted">
            {total === 0 ? "Nothing logged yet." : `${total} ${total === 1 ? "workout" : "workouts"} logged. Tap one to see every set, edit, repeat or delete it.`}
          </p>
        </div>
        <button type="button" className="btn secondary !min-h-11" onClick={onLogPast}>Log a past workout</button>
      </header>

      <p role="status" className="sr-only">{announce}</p>

      {/* Undo toast: portalled so page transforms do not break position: fixed. Its Undo button takes focus. */}
      {mounted && createPortal(<AnimatePresence>
        {undo && (
          <motion.div ref={toastRef} key={undo.n} role="group" aria-label="Workout deleted"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.95 }} transition={{ type: "spring", stiffness: 320, damping: 26 }}
            onPointerEnter={() => setPaused(true)} onPointerLeave={() => setPaused(false)}
            className="fixed inset-x-3 bottom-24 z-40 mx-auto max-w-md overflow-hidden rounded-3xl border-2 border-ink bg-ink text-white shadow-[0_18px_40px_-10px_rgb(11_31_29/.6)] md:bottom-6">
            <div className="flex items-center justify-between gap-3 p-3 pl-5">
              <p className="min-w-0 font-semibold !text-white"><span className="block truncate">Deleted &ldquo;{undo.w.title}&rdquo;</span></p>
              <button type="button" ref={focusOnMount} onClick={restore} className="btn hot !min-h-11 shrink-0 !px-5">Undo</button>
            </div>
            {!reduce && (
              <motion.span key={`${undo.n}-${paused}`} aria-hidden className="block h-1.5 origin-left bg-lime"
                initial={{ scaleX: 1 }} animate={{ scaleX: paused ? 1 : 0 }} transition={{ duration: paused ? 0 : UNDO_MS / 1000, ease: "linear" }} />
            )}
          </motion.div>
        )}
      </AnimatePresence>, document.body)}

      {total === 0 ? (
        <p className="card p-5 font-semibold">No workouts yet. Add a few moves above and save them, or log one you did earlier.</p>
      ) : (
        <div className="grid min-w-0 gap-6">
          <AnimatePresence initial={false}>
            {shown.map((g) => (
              <motion.section key={g.start} layout={!reduce} initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                aria-labelledby={`wk-${g.start}`} className="grid min-w-0 gap-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 id={`wk-${g.start}`} className="text-2xl">{g.label}</h3>
                  <span className="text-sm font-bold text-muted">
                    {g.workouts.length} {g.workouts.length === 1 ? "workout" : "workouts"} · {g.sets} {g.sets === 1 ? "set" : "sets"}
                  </span>
                </div>
                <ul className="grid min-w-0 gap-3">
                  <AnimatePresence initial={false} mode="popLayout">
                    {g.workouts.map((w) => (
                      <motion.li key={w.id} layout={!reduce ? "position" : false}
                        initial={reduce ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, x: -60, scale: 0.94, transition: { duration: 0.22 } }}
                        transition={{ type: "spring", stiffness: 300, damping: 28 }} className="min-w-0">
                        <WorkoutCard workout={w} history={workouts} today={today} imperial={imperial} draftHasMoves={draftHasMoves}
                          open={open.has(w.id)} editing={editing.has(w.id)}
                          onToggle={() => setOpen((s) => flip(s, w.id))}
                          onEdit={(on) => setEditing((s) => flip(s, w.id, on))}
                          onSave={(p) => onUpdate(w.id, p)}
                          onDelete={() => del(w)}
                          onRepeat={() => onRepeat(w)} />
                      </motion.li>
                    ))}
                  </AnimatePresence>
                </ul>
              </motion.section>
            ))}
          </AnimatePresence>
          {groups.length > weeks && (
            <button type="button" className="btn secondary justify-self-start" onClick={() => setWeeks((n) => n + WEEKS_STEP)}>
              Show older weeks ({groups.length - weeks} more)
            </button>
          )}
        </div>
      )}
    </section>
  );
}
