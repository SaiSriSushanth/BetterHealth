"use client";
import { useId, useMemo, useState } from "react";
import { EXERCISES, MUSCLE_BY_ID } from "@/lib/exercises";
import type { Exercise } from "@/lib/types";

/** Simple search over every exercise. Picking one calls onPick and clears the search. */
export function ExercisePicker({ onPick, label = "Add another exercise" }: { onPick(ex: Exercise): void; label?: string }) {
  const id = useId();
  const [q, setQ] = useState("");
  const matches = useMemo(() => {
    const words = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return EXERCISES.filter((e) => {
      const hay = `${e.name} ${MUSCLE_BY_ID[e.muscleId]?.label ?? ""} ${e.equipment}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    }).slice(0, 6);
  }, [q]);

  return (
    <div className="grid min-w-0 gap-2">
      <label className="lbl !mb-0" htmlFor={`${id}-q`}>{label}</label>
      <input id={`${id}-q`} type="search" className="field !min-h-12" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (matches[0]) { onPick(matches[0]); setQ(""); } } }}
        placeholder="Search, e.g. squat or chest" autoComplete="off" aria-describedby={`${id}-n`} />
      <p id={`${id}-n`} role="status" className="sr-only">
        {q.trim() ? `${matches.length} ${matches.length === 1 ? "match" : "matches"}` : ""}
      </p>
      {q.trim() !== "" && (matches.length === 0 ? (
        <p className="rounded-2xl bg-surface p-3 font-semibold">Nothing matches &ldquo;{q.trim()}&rdquo;. Try a muscle like chest or a word like press.</p>
      ) : (
        <ul className="grid gap-1 rounded-2xl border-2 border-ink bg-surface p-1.5" aria-label="Matching exercises">
          {matches.map((e) => (
            <li key={e.id}>
              <button type="button" aria-label={`Add ${e.name} (${MUSCLE_BY_ID[e.muscleId]?.label}, ${e.equipment})`} onClick={() => { onPick(e); setQ(""); }}
                className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left hover:bg-sun focus-visible:bg-sun">
                <span className="min-w-0">
                  <b className="block truncate">{e.name}</b>
                  <span className="text-sm font-semibold capitalize text-muted">{MUSCLE_BY_ID[e.muscleId]?.label} · {e.equipment}</span>
                </span>
                <span className="shrink-0 rounded-full border-2 border-ink px-3 py-1 text-sm font-bold">Add</span>
              </button>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}
