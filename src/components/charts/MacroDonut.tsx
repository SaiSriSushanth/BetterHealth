"use client";
import { motion, useReducedMotion } from "motion/react";

export interface Slice { label: string; value: number; color: string; detail: string }

/** Ring of shares with 2px gaps; the legend carries labels and values so colour is never the only cue. */
export function MacroDonut({ slices, center, sub, summary }: { slices: Slice[]; center: string; sub: string; summary: string }) {
  const reduce = useReducedMotion();
  const R = 70, SW = 24, C = 2 * Math.PI * R;
  const total = slices.reduce((a, s) => a + s.value, 0);
  let acc = 0;
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-center gap-6">
      <svg role="img" aria-label={summary} viewBox="0 0 180 180" className="size-44 shrink-0">
        <circle cx={90} cy={90} r={R} fill="none" stroke="var(--line)" strokeWidth={SW} />
        {total > 0 && slices.map((s, i) => {
          const frac = s.value / total;
          const start = acc; acc += frac;
          const len = Math.max(frac * C - 3, 0);
          return (
            <motion.circle key={s.label} cx={90} cy={90} r={R} fill="none" stroke={s.color} strokeWidth={SW}
              transform={`rotate(${start * 360 - 90} 90 90)`}
              initial={reduce ? false : { strokeDasharray: `0 ${C}` }} animate={{ strokeDasharray: `${len} ${C}` }}
              transition={{ type: "spring", stiffness: 50, damping: 15, delay: 0.2 + i * 0.15 }} />
          );
        })}
        <text x={90} y={88} textAnchor="middle" className="fill-ink font-display text-[28px] font-extrabold">{center}</text>
        <text x={90} y={108} textAnchor="middle" className="fill-muted text-[11px] font-bold">{sub}</text>
      </svg>
      <ul className="grid min-w-0 gap-2.5">
        {slices.map((s) => (
          <li key={s.label} className="flex items-center gap-3">
            <i aria-hidden className="size-4 shrink-0 rounded-full border-[1.5px] border-ink" style={{ background: s.color }} />
            <span className="min-w-0">
              <b className="font-display text-lg">{total ? Math.round((s.value / total) * 100) : 0}%</b> <span className="font-semibold">{s.label}</span>
              <span className="block text-sm text-muted">{s.detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
