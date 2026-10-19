"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CountUp, Reveal } from "@/components/fx";
import { HBars } from "@/components/charts/HBars";
import { WeekColumns } from "@/components/charts/WeekColumns";
import { staleMuscles, volumeByMuscle, workoutStreaks, workoutWeeks } from "@/lib/progress";
import type { Profile, WorkoutLog } from "@/lib/types";
import { RangeChips, toDisplay, unitLabel } from "./format";

const RANGE = ["7d", "30d", "90d"] as const;
const METRIC = ["volume", "sets"] as const;

export function TrainingSection({ profile, workouts, today }: { profile: Profile; workouts: WorkoutLog[]; today: string }) {
  const [range, setRange] = useState<(typeof RANGE)[number]>("30d");
  const [metric, setMetric] = useState<(typeof METRIC)[number]>("volume");
  const n = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const u = unitLabel(profile.units);
  const weeks = useMemo(() => workoutWeeks(workouts, today, 8), [workouts, today]);
  const streak = useMemo(() => workoutStreaks(workouts, today), [workouts, today]);
  const vol = useMemo(() => volumeByMuscle(workouts, today, n), [workouts, today, n]);
  const stale = useMemo(() => staleMuscles(workouts, today, 14), [workouts, today]);
  const trained = vol.filter((m) => m.sets > 0);
  const totalSets = trained.reduce((a, m) => a + m.sets, 0);
  const totalVol = trained.reduce((a, m) => a + m.volume, 0);
  const avg = weeks.slice(0, -1).reduce((a, w) => a + w.workouts, 0) / Math.max(weeks.length - 1, 1);
  const vText = (kg: number) => `${Math.round(toDisplay(kg, profile.units)).toLocaleString()} ${u}`;
  const rows = [...trained].sort((a, b) => (metric === "sets" ? b.sets - a.sets : b.volume - a.volume || b.sets - a.sets))
    .map((m) => ({ id: m.id, label: m.label, value: metric === "sets" ? m.sets : m.volume, text: `${m.sets} set${m.sets === 1 ? "" : "s"} · ${m.volume ? vText(m.volume) : "bodyweight"}` }));

  if (!workouts.length) {
    return (
      <section aria-labelledby="train-h" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <Reveal><h2 id="train-h" className="!text-[clamp(2rem,1.3rem+3vw,3.25rem)]">Training</h2></Reveal>
        <Reveal>
          <div className="block block-teal flex flex-wrap items-center justify-between gap-4 p-6 md:p-8">
            <div className="max-w-md">
              <p className="font-display text-2xl font-extrabold">No workouts yet</p>
              <p className="mt-1 font-medium">Log your first session to start a weekly streak and see which muscles you are working.</p>
            </div>
            <Link href="/train" className="btn">Start a workout</Link>
          </div>
        </Reveal>
      </section>
    );
  }

  return (
    <section aria-labelledby="train-h" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">
      <Reveal><h2 id="train-h" className="!text-[clamp(2rem,1.3rem+3vw,3.25rem)]">Training</h2></Reveal>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Reveal className="min-w-0">
          <div className="block block-teal grain relative h-full p-5 md:p-7">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3>Workouts per week</h3>
              <span className="text-sm font-bold">{avg.toLocaleString(undefined, { maximumFractionDigits: 1 })} a week on average</span>
            </div>
            <div className="mt-5">
              <WeekColumns weeks={weeks} summary={`Workouts in each of the last 8 weeks, oldest first: ${weeks.map((w) => w.workouts).join(", ")}.`} />
            </div>
          </div>
        </Reveal>
        <Reveal delay={0.06} className="min-w-0">
          <div className="block block-ink grain relative h-full p-5 md:p-7">
            <h3>Weekly streak</h3>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <p className="font-display text-6xl font-extrabold text-lime"><CountUp value={streak.current} /></p>
                <p className="font-semibold">week{streak.current === 1 ? "" : "s"} now</p>
              </div>
              <div>
                <p className="font-display text-6xl font-extrabold"><CountUp value={streak.best} /></p>
                <p className="font-semibold">best run</p>
              </div>
            </div>
            <p className="mt-4 text-sm text-white/80">
              A week counts when it has at least one workout, Monday to Sunday, so rest days never break it.{" "}
              {streak.thisWeek ? <b className="text-white">This week is already in.</b> : streak.current > 0 ? <b className="text-white">Train once before Sunday to keep it going.</b> : <b className="text-white">One workout this week starts a new streak.</b>}
            </p>
          </div>
        </Reveal>
      </div>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <Reveal className="min-w-0">
          <div className="card h-full min-w-0 p-5 md:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3>By muscle group</h3>
              <RangeChips label="Muscle range" options={RANGE} value={range} onChange={setRange} />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-muted"><b className="text-ink">{totalSets.toLocaleString()}</b> sets · <b className="text-ink">{vText(totalVol)}</b> lifted (reps &times; weight)</p>
              <RangeChips label="Bar length shows" options={METRIC} value={metric} onChange={setMetric} />
            </div>
            <div className="mt-5" key={`${range}${metric}`}>
              {rows.length ? <HBars rows={rows} label={`${metric === "sets" ? "Sets" : "Volume"} per muscle group, last ${n} days`} />
                : <p className="rounded-2xl bg-bg p-4 font-semibold">No sets logged in the last {n} days.</p>}
            </div>
          </div>
        </Reveal>
        <Reveal delay={0.06} className="min-w-0">
          <div className="block block-lime h-full p-5 md:p-7">
            <h3>Missing you</h3>
            {stale.length === 0 ? (
              <p className="mt-3 font-semibold">Every muscle group got some work in the last 14 days. Balanced.</p>
            ) : (
              <>
                <p className="mt-1 text-sm font-semibold">Not trained in the last 14 days. Fit one in next time.</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {stale.map((m) => (
                    <li key={m.id} className="rounded-full border-2 border-ink bg-white px-3 py-1.5 text-sm font-bold">
                      {m.label} <span className="font-semibold text-muted">{m.daysAgo === null ? "· never" : `· ${m.daysAgo}d`}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-5"><Link href="/train" className="btn">Plan a workout</Link></div>
              </>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
