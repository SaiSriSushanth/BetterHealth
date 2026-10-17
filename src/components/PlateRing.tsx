"use client";
import { motion, useReducedMotion } from "motion/react";
import type { Nutrients, Targets } from "@/lib/types";
import { CountUp } from "./fx";

/** Calorie ring on a dark surface. Protein, carbs and fat arcs draw in; the centre counts up. */
export function PlateRing({ eaten, targets }: { eaten: Nutrients; targets: Targets }) {
  const reduce = useReducedMotion();
  const R = 84, C = 2 * Math.PI * R;
  const parts = [
    { k: "protein", kcal: eaten.proteinG * 4, color: "var(--teal)" },
    { k: "carbs", kcal: eaten.carbsG * 4, color: "var(--sun)" },
    { k: "fat", kcal: eaten.fatG * 9, color: "var(--bubble)" },
  ];
  const total = Math.max(parts.reduce((s, p) => s + p.kcal, 0), 1);
  const fill = Math.min(eaten.kcal / targets.kcal, 1);
  const left = Math.round(targets.kcal - eaten.kcal);
  const over = left < 0;
  let offset = 0;
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[280px]">
      <svg viewBox="0 0 200 200" role="img" className="absolute inset-0 size-full"
        aria-label={`${Math.round(eaten.kcal)} of ${targets.kcal} calories eaten. Protein ${Math.round(eaten.proteinG)} grams, carbs ${Math.round(eaten.carbsG)} grams, fat ${Math.round(eaten.fatG)} grams.`}>
        <circle cx="100" cy="100" r={R} fill="none" stroke="rgb(255 255 255 / .14)" strokeWidth="18" />
        {eaten.kcal > 0 && parts.map((p, i) => {
          const len = Math.max((p.kcal / total) * fill * C - 4, 0);
          const el = (
            <motion.circle key={p.k} cx="100" cy="100" r={R} fill="none" stroke={over ? "var(--tangerine)" : p.color} strokeWidth="18"
              strokeLinecap="round" strokeDashoffset={-offset} transform="rotate(-90 100 100)"
              initial={reduce ? false : { strokeDasharray: `0 ${C}` }} animate={{ strokeDasharray: `${len} ${C}` }}
              transition={{ type: "spring", stiffness: 40, damping: 14, delay: 0.25 + i * 0.18 }} />
          );
          offset += (p.kcal / total) * fill * C;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center text-white" aria-hidden="true">
        <CountUp value={Math.abs(left)} className="font-display text-5xl font-extrabold tracking-tight" />
        <span className="text-sm font-semibold text-white/75">{over ? "kcal over" : "kcal left"}</span>
      </div>
    </div>
  );
}
