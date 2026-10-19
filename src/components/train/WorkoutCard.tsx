"use client";
import { useEffect, useId, useRef, useState } from "react";
import { focusOnMount } from "./shared";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { WorkoutLog } from "@/lib/types";
import { formatSet, formatVolume, friendlyDay, musclesOf, shortDate, workoutStats } from "@/lib/workouts";
import { WorkoutEditor } from "./WorkoutEditor";
import { Chevron, MuscleChip } from "./shared";

interface Props {
  workout: WorkoutLog;
  history: WorkoutLog[];
  today: string;
  imperial: boolean;
  open: boolean;
  editing: boolean;
  draftHasMoves: boolean;
  onToggle(): void;
  onEdit(on: boolean): void;
  onSave(patch: Pick<WorkoutLog, "title" | "day" | "entries">): Promise<void>;
  onDelete(): Promise<void>;
  onRepeat(): void;
}

const spring = { type: "spring", stiffness: 260, damping: 28 } as const;

export function WorkoutCard({ workout: w, history, today, imperial, open, editing, draftHasMoves, onToggle, onEdit, onSave, onDelete, onRepeat }: Props) {
  const id = useId();
  const reduce = useReducedMotion();
  const [confirm, setConfirm] = useState<null | "delete" | "repeat">(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const editRef = useRef<HTMLButtonElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  const st = workoutStats(w);
  const muscles = musclesOf(w.entries);

  useEffect(() => {
    if (wasEditing.current && !editing) (editRef.current ?? toggleRef.current)?.focus();
    wasEditing.current = editing;
  }, [editing]);
  useEffect(() => { if (!open) setConfirm(null); }, [open]);
  useEffect(() => {
    if (!saved) return;
    const t = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(t);
  }, [saved]);

  async function doDelete() {
    setBusy(true); setErr(null);
    try { await onDelete(); }
    catch { setErr("Could not delete. Check your connection and try again."); setBusy(false); }
  }
  function repeat() {
    if (draftHasMoves && confirm !== "repeat") { setConfirm("repeat"); return; }
    setConfirm(null);
    onRepeat();
  }

  return (
    <article className={`card relative min-w-0 overflow-hidden transition-shadow ${open ? "shadow-[6px_6px_0_var(--color-ink)]" : ""}`}>
      <div className="relative p-4 sm:p-5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="break-words text-xl font-extrabold leading-tight">
              {editing ? w.title : (
                <button ref={toggleRef} type="button" aria-expanded={open} aria-controls={`${id}-panel`} onClick={onToggle}
                  className="text-left after:absolute after:inset-0 after:rounded-[28px] after:content-[''] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-[3px] focus-visible:after:-outline-offset-[3px] focus-visible:after:outline-ink">
                  {w.title}
                </button>
              )}
            </h4>
            <p className="mt-0.5 text-sm font-bold text-ink2">
              {friendlyDay(w.day, today)}
              {!friendlyDay(w.day, today).includes(shortDate(w.day, today)) && <span className="font-semibold text-muted"> · {shortDate(w.day, today)}</span>}
            </p>
          </div>
          {!editing && (
            <motion.span aria-hidden animate={{ rotate: open ? 180 : 0 }} transition={reduce ? { duration: 0 } : spring}
              className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-ink bg-surface">
              <Chevron />
            </motion.span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Muscles worked">
          {muscles.map((m) => <MuscleChip key={m} id={m} />)}
        </div>
        <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
          <div className="flex gap-1"><dt className="font-semibold text-muted">Moves</dt><dd className="font-extrabold">{st.moves}</dd></div>
          <div className="flex gap-1"><dt className="font-semibold text-muted">Sets</dt><dd className="font-extrabold">{st.sets}</dd></div>
          {st.volumeKg > 0 && <div className="flex gap-1"><dt className="font-semibold text-muted">Volume</dt><dd className="font-extrabold">{formatVolume(st.volumeKg, imperial)}</dd></div>}
          <AnimatePresence>
            {saved && (
              <motion.span initial={reduce ? false : { opacity: 0, scale: 0.8, rotate: -10 }} animate={{ opacity: 1, scale: 1, rotate: -4 }} exit={{ opacity: 0 }}
                aria-hidden className="sticker pointer-events-none !py-0 text-xs">Saved</motion.span>
            )}
          </AnimatePresence>
        </dl>
        <p role="status" className="sr-only">{saved ? "Changes saved." : ""}</p>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div key="panel" id={`${id}-panel`} initial={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { height: "auto", opacity: 1 }} exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : spring} className="relative overflow-hidden">
            <div className="border-t-2 border-ink bg-bg p-4 sm:p-5">
              {editing ? (
                <WorkoutEditor workout={w} history={history} imperial={imperial} today={today} onClose={() => onEdit(false)}
                  onSave={async (p) => { await onSave(p); setSaved(true); }} />
              ) : (
                <>
                  <ol className="grid gap-3">
                    {w.entries.map((e, i) => (
                      <li key={`${e.exerciseId}-${i}`} className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><b className="break-words">{e.name}</b><MuscleChip id={e.muscleId} /></div>
                        <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label={`${e.name} sets`}>
                          {e.sets.map((s, j) => (
                            <li key={j} className="rounded-full border-2 border-line bg-surface px-2.5 py-0.5 text-sm font-semibold tabular-nums">
                              <span className="sr-only">Set {j + 1}: </span>{formatSet(s, imperial)}
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                  </ol>

                  <AnimatePresence mode="wait" initial={false}>
                    {confirm === "delete" ? (
                      <motion.div key="del" role="group" aria-label="Confirm delete" initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="mt-4 grid gap-3 rounded-2xl border-2 border-ink bg-tangerine p-3 text-ink">
                        <p className="font-bold">Delete this workout? You can undo for a few seconds after.</p>
                        <div className="flex flex-wrap gap-2">
                          <button ref={focusOnMount} type="button" className="btn secondary !min-h-11" onClick={() => setConfirm(null)}>Keep it</button>
                          <button type="button" className="btn !min-h-11" disabled={busy} onClick={doDelete}>{busy ? "Deleting…" : "Delete workout"}</button>
                        </div>
                      </motion.div>
                    ) : confirm === "repeat" ? (
                      <motion.div key="rep" role="group" aria-label="Confirm repeat" initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                        className="mt-4 grid gap-3 rounded-2xl border-2 border-ink bg-sun p-3 text-ink">
                        <p className="font-bold">Your current workout already has moves. Replace them with this one?</p>
                        <div className="flex flex-wrap gap-2">
                          <button ref={focusOnMount} type="button" className="btn secondary !min-h-11" onClick={() => setConfirm(null)}>Keep current</button>
                          <button type="button" className="btn !min-h-11" onClick={repeat}>Replace</button>
                        </div>
                      </motion.div>
                    ) : (
                      <motion.div key="act" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-4 flex flex-wrap gap-2">
                        <button type="button" className="btn hot !min-h-11" onClick={repeat}>Repeat today</button>
                        <button ref={editRef} type="button" className="btn secondary !min-h-11" onClick={() => onEdit(true)}>Edit</button>
                        <button type="button" className="btn ghost !min-h-11" onClick={() => setConfirm("delete")}>Delete</button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <p role="alert" className="mt-3 font-bold empty:hidden">{err}</p>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </article>
  );
}
