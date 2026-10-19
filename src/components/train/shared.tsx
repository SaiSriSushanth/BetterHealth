"use client";
import { useState } from "react";
import { MUSCLE_BY_ID } from "@/lib/exercises";
import type { Exercise, WorkoutEntry, WorkoutLog } from "@/lib/types";
import { lastSetsFor } from "@/lib/workouts";

/** Entry with a stable client-side key so list animations and focus survive reordering. Strip before saving. */
export type KeyedEntry = WorkoutEntry & { key: string };

let seq = 0;
export const newKey = () => `e${++seq}`;
export const withKeys = (entries: WorkoutEntry[]): KeyedEntry[] =>
  entries.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s })), key: newKey() }));
export const stripKeys = (entries: KeyedEntry[]): WorkoutEntry[] =>
  entries.map(({ exerciseId, name, muscleId, sets }) => ({ exerciseId, name, muscleId, sets: sets.map((s) => ({ ...s })) }));
export const entryFrom = (ex: Exercise, sets = 3, reps = 10, weightKg = 0): KeyedEntry => ({
  key: newKey(), exerciseId: ex.id, name: ex.name, muscleId: ex.muscleId,
  sets: Array.from({ length: sets }, () => ({ reps, weightKg })),
});

/** New entry prefilled with the sets from last time, or 3 x 10 if never logged. */
export const entryFromHistory = (ex: Exercise, history: WorkoutLog[], excludeId?: string): KeyedEntry => {
  const sets = lastSetsFor(history, ex.id, excludeId);
  return sets ? { ...entryFrom(ex), sets } : entryFrom(ex);
};

/** Stable ref callback that focuses an element when it mounts (works with AnimatePresence mode="wait"). */
export const focusOnMount = (el: HTMLElement | null) => { el?.focus(); };

/** Background class per body area. Ink text on all of them passes AA. */
export const AREA_BG: Record<string, string> = { upper: "bg-tangerine", arms: "bg-bubble", core: "bg-sun", lower: "bg-teal" };

export function MuscleChip({ id }: { id: string }) {
  const m = MUSCLE_BY_ID[id];
  return (
    <span className={`inline-flex items-center rounded-full border-2 border-ink px-2 py-0.5 text-xs font-bold text-ink ${m ? AREA_BG[m.area] : "bg-surface"}`}>
      {m?.label ?? id}
    </span>
  );
}

const parse = (t: string) => (t.trim() === "" ? NaN : Number(t.replace(",", ".")));
const fmt = (n: number) => (Number.isFinite(n) ? String(n) : "");

/**
 * Number input that keeps what the user typed (so "7." or "" do not jump around) and
 * reports parsed numbers; NaN means "not a number yet", which validation then explains.
 */
export function NumberField({
  id, label, value, onValue, invalid, decimal, className = "",
}: { id: string; label: string; value: number; onValue(n: number): void; invalid?: boolean; decimal?: boolean; className?: string }) {
  const [text, setText] = useState(fmt(value));
  const [prev, setPrev] = useState(value);
  if (!Object.is(value, prev)) {
    setPrev(value);
    const p = parse(text);
    const close = Number.isFinite(p) && Number.isFinite(value) && Math.abs(p - value) < 0.06;
    if (!close && !(Number.isNaN(value) && Number.isNaN(p))) setText(fmt(value));
  }
  return (
    <>
      <label className="sr-only" htmlFor={id}>{label}</label>
      <input id={id} className={`field !min-h-11 min-w-0 !rounded-xl !px-2 text-center tabular-nums ${invalid ? "!border-tangerine !bg-[#fff1ea]" : ""} ${className}`}
        inputMode={decimal ? "decimal" : "numeric"} autoComplete="off" value={text} aria-invalid={invalid || undefined}
        onChange={(e) => { setText(e.target.value); onValue(parse(e.target.value)); }} />
    </>
  );
}

export function IconButton({
  label, onClick, disabled, children, buttonRef, className = "",
}: { label: string; onClick(): void; disabled?: boolean; children: React.ReactNode; buttonRef?: (el: HTMLButtonElement | null) => void; className?: string }) {
  return (
    <button ref={buttonRef} type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className={`grid size-11 shrink-0 place-items-center rounded-full border-2 border-ink bg-surface text-ink transition-transform hover:-translate-y-0.5 hover:bg-sun disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:translate-y-0 disabled:hover:bg-surface ${className}`}>
      {children}
    </button>
  );
}

export const Chevron = ({ up }: { up?: boolean }) => (
  <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: up ? "rotate(180deg)" : undefined }}><path d="m6 9 6 6 6-6" /></svg>
);
export const Cross = () => (
  <svg aria-hidden width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
);
