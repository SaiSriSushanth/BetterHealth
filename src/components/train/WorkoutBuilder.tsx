"use client";
import { useId, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { WorkoutLog } from "@/lib/types";
import { type EntryProblem, countSets, formatVolume, friendlyDay, shortDate, validateDay, validateEntries, volumeKg } from "@/lib/workouts";
import { EntryList } from "./EntryList";
import { ExercisePicker } from "./ExercisePicker";
import { entryFromHistory, type KeyedEntry, stripKeys } from "./shared";

interface Props {
  entries: KeyedEntry[];
  setEntries(next: KeyedEntry[]): void;
  title: string;
  setTitle(t: string): void;
  day: string;
  setDay(d: string): void;
  today: string;
  imperial: boolean;
  history: WorkoutLog[];
  onSave(w: Pick<WorkoutLog, "title" | "day" | "entries">): Promise<void>;
  onClear(): void;
  headRef?: React.Ref<HTMLHeadingElement>;
}

/** The "Your workout" builder: running totals, last-time hints, date for logging past sessions. */
export function WorkoutBuilder({ entries, setEntries, title, setTitle, day, setDay, today, imperial, history, onSave, onClear, headRef }: Props) {
  const id = useId();
  const reduce = useReducedMotion();
  const [problem, setProblem] = useState<EntryProblem | null>(null);
  const [saving, setSaving] = useState(false);
  const sets = countSets(entries);
  const vol = volumeKg(entries);
  const past = day !== today;

  function change(next: KeyedEntry[]) { setEntries(next); setProblem(null); }
  async function save() {
    const dayErr = validateDay(day, today);
    const plain = stripKeys(entries);
    const p: EntryProblem | null = dayErr ? { message: dayErr } : validateEntries(plain);
    setProblem(p);
    if (p) {
      const en = p.entry !== undefined ? entries[p.entry] : undefined;
      const el = en && p.set !== undefined ? document.getElementById(`${id}-x-${en.key}-${p.field === "reps" ? "r" : "w"}${p.set}`) : null;
      setTimeout(() => (el ?? document.getElementById(`${id}-err`))?.focus(), 0);
      return;
    }
    setSaving(true);
    try { await onSave({ title, day, entries: plain }); }
    catch { setProblem({ message: "Could not save. Check your connection and try again." }); }
    finally { setSaving(false); }
  }

  return (
    <motion.section initial={reduce ? false : { opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }} transition={{ type: "spring", stiffness: 200, damping: 20 }}
      className="block block-sun min-w-0 p-4 sm:p-5 md:p-7" aria-labelledby={`${id}-h`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-h`} ref={headRef} tabIndex={-1} className="outline-none">Your workout</h2>
        <p className="rounded-full border-2 border-ink bg-surface px-3 py-1 text-sm font-extrabold tabular-nums" aria-live="polite">
          {entries.length} {entries.length === 1 ? "move" : "moves"} · {sets} {sets === 1 ? "set" : "sets"}
          {vol > 0 && <span className="font-semibold"> · {formatVolume(vol, imperial)}</span>}
        </p>
      </div>

      <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_12rem] sm:max-w-xl">
        <div className="min-w-0"><label className="lbl" htmlFor={`${id}-t`}>Name it</label>
          <input id={`${id}-t`} className="field !min-h-12" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Leg day" /></div>
        <div className="min-w-0"><label className="lbl" htmlFor={`${id}-d`}>Date</label>
          <input id={`${id}-d`} type="date" className="field !min-h-12" value={day} max={today} required aria-describedby={`${id}-dh`}
            onChange={(e) => { setDay(e.target.value); setProblem(null); }} /></div>
      </div>
      <p id={`${id}-dh`} className="mt-2 text-sm font-semibold">
        {past && !validateDay(day, today) ? `Logging a past workout for ${friendlyDay(day, today).replace(/^Yesterday$/, "yesterday")}, ${shortDate(day, today)}.` : "Change the date to log a workout you did earlier."}
      </p>

      <div className="mt-5">
        {entries.length === 0 ? (
          <p className="rounded-3xl border-2 border-dashed border-ink bg-surface/60 p-4 font-semibold">No moves yet. Search below, or tap a muscle above and add moves from its list.</p>
        ) : (
          <EntryList entries={entries} onChange={change} imperial={imperial} today={today} history={history} idPrefix={`${id}-x`} problem={problem} wide
            onEmptied={() => document.getElementById(`${id}-pick`)?.querySelector("input")?.focus()} />
        )}
      </div>

      <div id={`${id}-pick`} className="mt-4 max-w-xl"><ExercisePicker label={entries.length ? "Add another exercise" : "Add an exercise"} onPick={(ex) => change([...entries, entryFromHistory(ex, history)])} /></div>

      <p id={`${id}-err`} tabIndex={-1} role="alert" className="mt-4 rounded-2xl border-2 border-ink bg-surface p-3 font-bold empty:hidden">{problem?.message}</p>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button type="button" className="btn hot" onClick={save} disabled={saving}>{saving ? "Saving…" : past ? "Save past workout" : "Save workout"}</button>
        <button type="button" className="btn ghost" onClick={() => { setProblem(null); onClear(); }}>{entries.length ? "Clear workout" : "Close"}</button>
      </div>
    </motion.section>
  );
}
