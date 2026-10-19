"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { WorkoutLog } from "@/lib/types";
import { type EntryProblem, sameWorkout, validateDay, validateEntries } from "@/lib/workouts";
import { EntryList } from "./EntryList";
import { ExercisePicker } from "./ExercisePicker";
import { focusOnMount, entryFromHistory, type KeyedEntry, stripKeys, withKeys } from "./shared";

interface Props {
  workout: WorkoutLog;
  history: WorkoutLog[];
  imperial: boolean;
  today: string;
  onSave(patch: Pick<WorkoutLog, "title" | "day" | "entries">): Promise<void>;
  onClose(): void;
}

/** Inline editor for a saved workout. Cancel asks before throwing away changes. */
export function WorkoutEditor({ workout, history, imperial, today, onSave, onClose }: Props) {
  const id = useId();
  const reduce = useReducedMotion();
  const [title, setTitle] = useState(workout.title);
  const [day, setDay] = useState(workout.day);
  const [entries, setEntries] = useState<KeyedEntry[]>(() => withKeys(workout.entries));
  const [problem, setProblem] = useState<EntryProblem | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const errRef = useRef<HTMLParagraphElement>(null);

  const draft = useMemo(() => ({ title: title.trim() || workout.title, day, entries: stripKeys(entries) }), [title, day, entries, workout.title]);
  const dirty = !sameWorkout(draft, workout);

  useEffect(() => { titleRef.current?.focus(); }, []);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  function change(next: KeyedEntry[]) { setEntries(next); setProblem(null); setConfirmDiscard(false); }

  async function save() {
    const dayErr = validateDay(day, today);
    const p: EntryProblem | null = dayErr ? { message: dayErr } : validateEntries(draft.entries);
    setProblem(p);
    if (p) { setTimeout(() => focusProblem(p), 0); return; }
    if (!dirty) { onClose(); return; }
    setSaving(true);
    try { await onSave(draft); onClose(); }
    catch { setProblem({ message: "Could not save. Check your connection and try again." }); }
    finally { setSaving(false); }
  }
  function focusProblem(p: EntryProblem) {
    const en = p.entry !== undefined ? entries[p.entry] : undefined;
    const el = en && p.set !== undefined ? document.getElementById(`${id}-x-${en.key}-${p.field === "reps" ? "r" : "w"}${p.set}`) : null;
    (el ?? errRef.current)?.focus();
  }
  function cancel() { if (dirty) setConfirmDiscard(true); else onClose(); }

  return (
    <motion.form initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid min-w-0 gap-4"
      onSubmit={(e) => { e.preventDefault(); void save(); }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); cancel(); } }} aria-label={`Edit ${workout.title}`}>
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="min-w-0"><label className="lbl" htmlFor={`${id}-t`}>Name</label>
          <input ref={titleRef} id={`${id}-t`} className="field !min-h-12" value={title} maxLength={80}
            onChange={(e) => { setTitle(e.target.value); setConfirmDiscard(false); }} /></div>
        <div className="min-w-0"><label className="lbl" htmlFor={`${id}-d`}>Date</label>
          <input id={`${id}-d`} type="date" className="field !min-h-12" value={day} max={today} required
            aria-invalid={validateDay(day, today) ? true : undefined}
            onChange={(e) => { setDay(e.target.value); setProblem(null); setConfirmDiscard(false); }} /></div>
      </div>

      <EntryList entries={entries} onChange={change} imperial={imperial} today={today} history={history}
        excludeId={workout.id} idPrefix={`${id}-x`} problem={problem} onEmptied={() => document.getElementById(`${id}-pick`)?.querySelector("input")?.focus()} />
      {entries.length === 0 && <p className="rounded-2xl bg-bg p-3 font-semibold">No exercises left. Add one below, or cancel to keep the workout as it was.</p>}

      <div id={`${id}-pick`}><ExercisePicker onPick={(ex) => change([...entries, entryFromHistory(ex, history, workout.id)])} /></div>

      <p ref={errRef} tabIndex={-1} role="alert" className="rounded-2xl border-2 border-ink bg-tangerine p-3 font-bold text-ink empty:hidden">{problem?.message}</p>

      <AnimatePresence mode="wait" initial={false}>
        {confirmDiscard ? (
          <motion.div key="confirm" initial={reduce ? false : { opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            className="grid gap-3 rounded-2xl border-2 border-ink bg-sun p-3 sm:flex sm:flex-wrap sm:items-center" role="group" aria-label="Unsaved changes">
            <p className="font-bold sm:mr-auto">You have unsaved changes. Discard them?</p>
            <div className="flex flex-wrap gap-2">
              <button ref={focusOnMount} type="button" className="btn secondary !min-h-11" onClick={() => setConfirmDiscard(false)}>Keep editing</button>
              <button type="button" className="btn !min-h-11" onClick={onClose}>Discard changes</button>
            </div>
          </motion.div>
        ) : (
          <motion.div key="actions" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-wrap items-center gap-2">
            <button type="submit" className="btn hot !min-h-11" disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
            <button type="button" className="btn secondary !min-h-11" onClick={cancel}>Cancel</button>
            {dirty && <span className="text-sm font-semibold text-muted">Unsaved changes</span>}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.form>
  );
}
