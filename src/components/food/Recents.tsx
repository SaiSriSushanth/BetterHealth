"use client";
import { useId, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useApp } from "@/components/AppProvider";
import { useReducedMotion } from "@/components/fx";
import { dayLabel, recentFoods, relog, shiftDay } from "@/lib/foods";
import type { FoodLog, Meal } from "@/lib/types";
import { MEAL_BG, Macros, spring } from "./shared";

/** The last 12 distinct foods you logged. One tap logs the same portion again. */
export function Recents({ meal, target = meal, onLog }: { meal: Meal; target?: string; onLog: (entry: Omit<FoodLog, "id" | "day">, el: HTMLElement) => Promise<void> }) {
  const { food, today } = useApp();
  const reduce = useReducedMotion();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const list = useMemo(() => recentFoods(food, 12, q), [food, q]);
  const sid = useId();

  if (!food.length) {
    return (
      <div className="rounded-3xl border-2 border-dashed border-ink bg-white/80 p-5">
        <p className="font-display text-xl font-extrabold">No recent foods yet.</p>
        <p className="mt-1 text-ink2">Once you log something it shows up here, ready to log again in one tap.</p>
      </div>
    );
  }

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <div className="min-w-0">
        <label className="lbl !text-base" htmlFor={`${sid}-q`}>Search recent foods</label>
        <input id={`${sid}-q`} type="search" className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name" maxLength={60} />
      </div>
      {list.length === 0 ? (
        <p className="rounded-2xl bg-white px-4 py-3 font-semibold">Nothing recent matches that.</p>
      ) : (
        <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2" aria-label="Recent foods">
          {list.map((r, i) => (
            <motion.li key={r.id} initial={reduce ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: Math.min(i, 8) * 0.03 }}
              className="flex min-w-0 items-center gap-3 rounded-3xl border-2 border-ink bg-white p-3">
              <span aria-hidden className={`size-3 shrink-0 self-start rounded-full border-2 border-ink ${MEAL_BG[r.meal]} mt-2`} />
              <div className="min-w-0 flex-1">
                <b className="block break-words leading-tight">{r.name}</b>
                <span className="block text-sm font-semibold">{r.portion} · {Math.round(r.kcal)} kcal</span>
                <span className="block text-sm text-ink2"><Macros n={r} /></span>
                <span className="block text-xs font-semibold text-ink2"><span className="capitalize">{r.meal}</span>, {r.day >= shiftDay(today, -1) ? dayLabel(r.day, today).toLowerCase() : dayLabel(r.day, today)}</span>
              </div>
              <button className="btn !min-h-11 shrink-0 !px-4 text-sm" disabled={busy === r.id} aria-label={`Log ${r.name} again, ${r.portion}, to ${target}`}
                onClick={async (e) => {
                  const el = e.currentTarget;
                  setBusy(r.id);
                  try { await onLog(relog(r, meal), el); } finally { setBusy(null); }
                }}>{busy === r.id ? "Adding…" : "Log again"}</button>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
