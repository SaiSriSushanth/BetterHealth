"use client";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { lbToKg } from "@/lib/goals";
import type { WorkoutLog } from "@/lib/types";
import { type EntryProblem, displayWeight, formatSet, formatWeight, friendlyDay, lastPerformance, moveItem } from "@/lib/workouts";
import { Chevron, Cross, IconButton, type KeyedEntry, MuscleChip, NumberField } from "./shared";

interface Props {
  entries: KeyedEntry[];
  onChange(next: KeyedEntry[]): void;
  imperial: boolean;
  today: string;
  /** saved workouts, for the "last time" hint */
  history: WorkoutLog[];
  /** workout being edited, left out of the hint */
  excludeId?: string;
  idPrefix: string;
  problem?: EntryProblem | null;
  /** called when the last exercise is removed, so the caller can move focus somewhere sensible */
  onEmptied?(): void;
  /** two columns on wide screens */
  wide?: boolean;
}

/** Editable list of exercises and their sets. Shared by the builder and the history editor. */
export function EntryList({ entries, onChange, imperial, today, history, excludeId, idPrefix, problem, onEmptied, wide }: Props) {
  const reduce = useReducedMotion();
  const refs = useRef(new Map<string, HTMLElement | null>());
  const [focusNext, setFocusNext] = useState<string | null>(null);
  const unit = imperial ? "lb" : "kg";

  useEffect(() => {
    if (!focusNext) return;
    const el = focusNext.startsWith("#") ? document.getElementById(focusNext.slice(1)) : refs.current.get(focusNext);
    if (el && !(el as HTMLButtonElement).disabled) el.focus();
    else if (focusNext.endsWith(":up")) refs.current.get(focusNext.replace(/:up$/, ":down"))?.focus();
    else if (focusNext.endsWith(":down")) refs.current.get(focusNext.replace(/:down$/, ":up"))?.focus();
    setFocusNext(null);
  }, [focusNext, entries]);

  const reg = (k: string) => (el: HTMLElement | null) => { refs.current.set(k, el); };
  const setEntry = (i: number, e: KeyedEntry) => onChange(entries.map((x, xi) => (xi === i ? e : x)));
  const setVal = (i: number, j: number, field: "reps" | "weightKg", v: number) =>
    setEntry(i, { ...entries[i], sets: entries[i].sets.map((s, sj) => (sj === j ? { ...s, [field]: v } : s)) });

  function move(i: number, dir: -1 | 1) {
    const k = entries[i].key;
    onChange(moveItem(entries, i, i + dir));
    setFocusNext(`${k}:${dir < 0 ? "up" : "down"}`);
  }
  function remove(i: number) {
    const next = entries.filter((_, x) => x !== i);
    onChange(next);
    if (!next.length) onEmptied?.();
    else setFocusNext(`${next[Math.min(i, next.length - 1)].key}:item`);
  }
  function addSet(i: number) {
    const e = entries[i];
    const last = e.sets[e.sets.length - 1] ?? { reps: 10, weightKg: 0 };
    setEntry(i, { ...e, sets: [...e.sets, { ...last }] });
    setFocusNext(`#${idPrefix}-${e.key}-r${e.sets.length}`);
  }
  function removeSet(i: number, j: number) {
    const e = entries[i];
    setEntry(i, { ...e, sets: e.sets.filter((_, x) => x !== j) });
    setFocusNext(e.sets.length > 1 ? `#${idPrefix}-${e.key}-r${Math.max(0, j - 1)}` : `${e.key}:add`);
  }

  return (
    <ul className={`grid min-w-0 gap-3 ${wide ? "xl:grid-cols-2 xl:items-start" : ""}`}>
      <AnimatePresence initial={false}>
        {entries.map((en, i) => {
          const last = en.exerciseId ? lastPerformance(history, en.exerciseId, excludeId) : null;
          const base = `${idPrefix}-${en.key}`;
          return (
            <motion.li key={en.key} layout={!reduce} ref={reg(`${en.key}:item`)} tabIndex={-1}
              initial={reduce ? false : { opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: 40, transition: { duration: 0.18 } }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="min-w-0 rounded-3xl border-2 border-ink bg-surface p-3 outline-offset-2 sm:p-4" aria-label={`${en.name}, exercise ${i + 1} of ${entries.length}`}>
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0 pt-1">
                  <b className="block break-words text-lg leading-tight">{en.name}</b>
                  <div className="mt-1 flex flex-wrap items-center gap-2"><MuscleChip id={en.muscleId} />
                    <span className="text-sm font-semibold text-muted">{en.sets.length} {en.sets.length === 1 ? "set" : "sets"}</span></div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <IconButton label={`Move ${en.name} up`} disabled={i === 0} onClick={() => move(i, -1)} buttonRef={reg(`${en.key}:up`)}><Chevron up /></IconButton>
                  <IconButton label={`Move ${en.name} down`} disabled={i === entries.length - 1} onClick={() => move(i, 1)} buttonRef={reg(`${en.key}:down`)}><Chevron /></IconButton>
                  <IconButton label={`Remove ${en.name}`} onClick={() => remove(i)} className="hover:!bg-tangerine"><Cross /></IconButton>
                </div>
              </div>

              <p className="mt-2 rounded-xl bg-bg px-3 py-2 text-sm font-semibold text-ink2">
                {last ? (
                  <>Last time ({friendlyDay(last.day, today)}): {last.sets} {last.sets === 1 ? "set" : "sets"}, top {formatSet(last.top, imperial)}
                    {last.bestKg > last.top.weightKg ? `. Best ${formatWeight(last.bestKg, imperial)}` : ""}.</>
                ) : "First time logging this one."}
              </p>

              <div className="mt-3 grid min-w-0 max-w-md grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.2fr)_2.75rem] items-center gap-x-2 gap-y-2">
                <span aria-hidden className="text-xs font-bold uppercase text-muted">Set</span>
                <span aria-hidden className="text-xs font-bold uppercase text-muted">Reps</span>
                <span aria-hidden className="text-xs font-bold uppercase text-muted">Weight ({unit})</span>
                <span />
                {en.sets.map((s, j) => {
                  const bad = problem?.entry === i && problem.set === j ? problem.field : undefined;
                  return (
                    <div key={j} role="group" aria-label={`Set ${j + 1}`} className="contents">
                      <span className="grid size-8 place-items-center rounded-full bg-ink text-sm font-bold text-white">{j + 1}</span>
                      <NumberField id={`${base}-r${j}`} label={`${en.name}, set ${j + 1} reps`} value={s.reps}
                        invalid={bad === "reps"} onValue={(n) => setVal(i, j, "reps", n)} />
                      <NumberField id={`${base}-w${j}`} label={`${en.name}, set ${j + 1} weight in ${unit}`} decimal
                        value={Number.isFinite(s.weightKg) ? displayWeight(s.weightKg, imperial) : NaN} invalid={bad === "weightKg"}
                        onValue={(n) => setVal(i, j, "weightKg", imperial && Number.isFinite(n) ? lbToKg(n) : n)} />
                      <IconButton label={`Remove set ${j + 1} of ${en.name}`} onClick={() => removeSet(i, j)} className="!border-line hover:!border-ink"><Cross /></IconButton>
                    </div>
                  );
                })}
              </div>
              <button type="button" ref={reg(`${en.key}:add`)} onClick={() => addSet(i)} className="btn secondary mt-3 !min-h-11 !px-4 text-sm">Add set</button>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
