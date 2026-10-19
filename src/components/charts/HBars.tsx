"use client";
import { motion, useReducedMotion } from "motion/react";

export interface HBar { id: string; label: string; value: number; text: string }

/** Labelled horizontal bars (HTML, so labels wrap and never overflow). Each row states its value in text. */
export function HBars({ rows, label, barClass = "bg-teal" }: { rows: HBar[]; label: string; barClass?: string }) {
  const reduce = useReducedMotion();
  const max = Math.max(...rows.map((r) => r.value), 0) || 1;
  return (
    <ul aria-label={label} className="grid gap-3">
      {rows.map((r, i) => (
        <li key={r.id} className="grid min-w-0 grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-3 sm:grid-cols-[8rem_minmax(0,1fr)]">
          <span className="truncate text-sm font-bold">{r.label}</span>
          <span className="min-w-0">
            <span className="block h-4 overflow-hidden rounded-full bg-bg">
              <motion.span className={`block h-full rounded-full border-[1.5px] border-ink ${barClass}`}
                style={{ minWidth: r.value > 0 ? 8 : 0, width: reduce ? `${(r.value / max) * 100}%` : undefined }}
                {...(reduce ? {} : { initial: { width: 0 }, whileInView: { width: `${(r.value / max) * 100}%` }, viewport: { once: true } })}
                transition={{ type: "spring", stiffness: 70, damping: 16, delay: reduce ? 0 : i * 0.04 }} />
            </span>
            <span className="mt-0.5 block text-xs font-semibold text-muted">{r.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
