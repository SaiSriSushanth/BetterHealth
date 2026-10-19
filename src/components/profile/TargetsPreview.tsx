"use client";
import { AnimatePresence, motion } from "motion/react";
import { CountUp, useReducedMotion } from "@/components/fx";
import type { Targets } from "@/lib/types";

const ROWS: { k: keyof Targets; label: string; unit: string; dot: string }[] = [
  { k: "proteinG", label: "Protein", unit: "g", dot: "bg-teal" },
  { k: "carbsG", label: "Carbs", unit: "g", dot: "bg-sun" },
  { k: "fatG", label: "Fat", unit: "g", dot: "bg-bubble" },
  { k: "fiberG", label: "Fibre", unit: "g", dot: "bg-tangerine" },
];

function Delta({ d, unit }: { d: number; unit: string }) {
  if (!d) return null;
  return (
    <span className="rounded-full border-2 border-ink bg-surface px-2 py-0.5 text-xs font-extrabold tabular-nums">
      {d > 0 ? "+" : "−"}{Math.abs(d).toLocaleString()}{unit}
    </span>
  );
}

/** Before/after view of the daily targets while the profile is being edited. */
export function TargetsPreview({ before, after, problem }: { before: Targets; after: Targets | null; problem: string | null }) {
  const reduce = useReducedMotion();
  const t = after ?? before;
  const changed = !!after && (Object.keys(before) as (keyof Targets)[]).some((k) => before[k] !== after[k]);
  const dk = after ? after.kcal - before.kcal : 0;
  return (
    <section aria-labelledby="plate-h" className="block block-lime grid min-w-0 gap-4 p-5 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="plate-h" className="text-2xl">Your daily plate</h2>
        <AnimatePresence initial={false}>
          {changed && (
            <motion.span key="new" className="sticker" initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6, rotate: -12 }} animate={{ opacity: 1, scale: 1, rotate: -4 }} exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 18 }}>
              Not saved yet
            </motion.span>
          )}
        </AnimatePresence>
      </div>

      <div aria-live="polite" aria-atomic="true">
        <p className="display text-[clamp(3.5rem,2rem+6vw,5rem)] leading-[.85] tracking-tighter tabular-nums"><CountUp value={t.kcal} duration={0.6} /></p>
        <p className="mt-1 flex flex-wrap items-center gap-2 font-bold">
          calories a day <Delta d={dk} unit="" />
        </p>
        <p className="mt-1 min-h-6 text-sm font-semibold">{changed ? `Was ${before.kcal.toLocaleString()} kcal` : "Matches what's saved"}</p>
      </div>

      <ul className="grid min-w-0 gap-1.5">
        {ROWS.map((r) => {
          const d = after ? after[r.k] - before[r.k] : 0;
          return (
            <li key={r.k} className="flex min-w-0 items-center justify-between gap-2 rounded-2xl bg-surface/70 px-3 py-2">
              <span className="flex min-w-0 items-center gap-2 font-semibold"><i aria-hidden className={`size-3 shrink-0 rounded-full border-2 border-ink ${r.dot}`} />{r.label}</span>
              <span className="flex items-center gap-2 tabular-nums">
                {d !== 0 && <span className="text-sm text-ink2 line-through decoration-2">{before[r.k]}{r.unit}</span>}
                <b>{t[r.k]}{r.unit}</b>
                <span className="sr-only">{d !== 0 ? `, was ${before[r.k]}${r.unit}` : ""}</span>
              </span>
            </li>
          );
        })}
      </ul>

      {problem && <p className="rounded-2xl border-2 border-ink bg-surface px-3 py-2 text-sm font-bold">{problem}. Fix it to see your new plate.</p>}
    </section>
  );
}
