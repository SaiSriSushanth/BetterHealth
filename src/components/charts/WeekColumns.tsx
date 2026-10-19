"use client";
import { motion, useReducedMotion } from "motion/react";
import type { WeekBucket } from "@/lib/progress";
import { shortDate, SrTable } from "./shared";

/** Workouts per calendar week as ink columns with the count printed on each. Meant for a colour block. */
export function WeekColumns({ weeks, summary }: { weeks: WeekBucket[]; summary: string }) {
  const reduce = useReducedMotion();
  const max = Math.max(3, ...weeks.map((w) => w.workouts));
  return (
    <figure className="m-0 min-w-0">
      <div role="img" aria-label={summary} className="grid h-40 grid-flow-col items-end gap-1.5 sm:gap-2" style={{ gridAutoColumns: "minmax(0,1fr)" }}>
        {weeks.map((w, i) => {
          const pct = (w.workouts / max) * 82; // leave room for the count label
          const last = i === weeks.length - 1;
          return (
            <div key={w.start} aria-hidden className="relative flex h-full flex-col justify-end">
              <span className="mb-1 text-center font-display text-sm font-extrabold">{w.workouts || ""}</span>
              <motion.span className={`mx-auto block w-full max-w-11 rounded-t-[10px] rounded-b-[3px] border-2 border-ink ${last ? "bg-lime" : "bg-ink"}`}
                style={{ height: reduce ? `max(${pct}%, 4px)` : undefined, minHeight: 4 }}
                {...(reduce ? {} : { initial: { height: 0 }, whileInView: { height: `${Math.max(pct, 3)}%` }, viewport: { once: true },
                  transition: { type: "spring", stiffness: 80, damping: 14, delay: i * 0.05 } })} />
            </div>
          );
        })}
      </div>
      <div aria-hidden className="mt-2 grid grid-flow-col gap-1.5 text-center text-[11px] font-bold sm:gap-2" style={{ gridAutoColumns: "minmax(0,1fr)" }}>
        {weeks.map((w, i) => <span key={w.start} className="truncate">{i === weeks.length - 1 ? "Now" : i % 2 === (weeks.length - 1) % 2 ? shortDate(w.start) : ""}</span>)}
      </div>
      <SrTable caption="Workouts per week" head={["Week starting", "Workouts", "Active days"]} rows={weeks.map((w) => [shortDate(w.start, { month: "short", day: "numeric", year: "numeric" }), w.workouts, w.activeDays])} />
    </figure>
  );
}
