"use client";
import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { kgToLb, lbToKg } from "@/lib/goals";
import type { Profile } from "@/lib/types";

export type Units = Profile["units"];
export const unitLabel = (u: Units) => (u === "imperial" ? "lb" : "kg");
export const toDisplay = (kg: number, u: Units) => (u === "imperial" ? kgToLb(kg) : kg);
export const fromDisplay = (v: number, u: Units) => (u === "imperial" ? lbToKg(v) : v);
export const fmt = (n: number, digits = 1) => n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
export const fmtWeight = (kg: number, u: Units, digits = 1) => `${fmt(toDisplay(kg, u), digits)} ${unitLabel(u)}`;
export const signed = (n: number, digits = 1) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${fmt(Math.abs(n), digits)}`;

/** CountUp that keeps decimals and an optional sign. */
export function Num({ value, digits = 1, sign = false, className }: { value: number; digits?: number; sign?: boolean; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const from = useRef(0);
  const text = (v: number) => (sign ? signed(v, digits) : fmt(v, digits));
  useEffect(() => {
    if (!inView || !ref.current) return;
    if (reduce) { ref.current.textContent = text(value); return; }
    const c = animate(from.current, value, { duration: 1.1, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => { if (ref.current) ref.current.textContent = text(v); } });
    from.current = value;
    return () => c.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, value, reduce, digits, sign]);
  return <span ref={ref} className={className}>{text(reduce ? value : 0)}</span>;
}

/** Range picker as a row of toggle chips. */
export function RangeChips<K extends string>({ options, value, onChange, label }: { options: readonly K[]; value: NoInfer<K>; onChange: (k: K) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o} type="button" className="chip !min-h-11 !normal-case" aria-pressed={o === value} onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  );
}
