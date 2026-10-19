"use client";
import { CountUp, Reveal } from "@/components/fx";
import { calorieStats, dailyTotals, weightSummary, workoutStreaks, workoutWeeks } from "@/lib/progress";
import type { FoodLog, Profile, Targets, WeightLog, WorkoutLog } from "@/lib/types";
import { Num, toDisplay, unitLabel } from "./format";

interface Props { profile: Profile; targets: Targets; food: FoodLog[]; workouts: WorkoutLog[]; weights: WeightLog[]; today: string }

/** "This week" headline block: four big counters on a tangerine block. */
export function WeekHero({ profile, targets, food, workouts, weights, today }: Props) {
  const thisWeek = workoutWeeks(workouts, today, 1)[0];
  const cal = calorieStats(dailyTotals(food, today, 7), targets.kcal);
  const w = weightSummary(weights, today, 7);
  const streak = workoutStreaks(workouts, today);
  const u = unitLabel(profile.units);
  const change = w.change === null ? null : toDisplay(w.change, profile.units);

  const bits: string[] = [];
  if (change !== null) bits.push(Math.abs(change) < 0.05 ? "Weight steady" : `${change < 0 ? "Down" : "Up"} ${Math.abs(change).toFixed(1)} ${u}`);
  bits.push(thisWeek.workouts ? `${thisWeek.workouts} workout${thisWeek.workouts === 1 ? "" : "s"} in` : "No workout yet");
  if (cal.loggedDays) bits.push(`${cal.onTarget} of ${cal.loggedDays} days on target`);

  const tiles = [
    { label: "Workouts this week", value: <CountUp value={thisWeek.workouts} />, sub: "Monday to today" },
    { label: "Average calories", value: cal.loggedDays ? <CountUp value={cal.avgKcal} /> : "–", sub: cal.loggedDays ? `last 7 days, target ${targets.kcal.toLocaleString()}` : "nothing logged in 7 days" },
    { label: "Weight, 7 days", value: change === null ? "–" : <><Num value={change} sign /><span className="text-xl"> {u}</span></>, sub: change === null ? "two weigh-ins needed" : `now ${toDisplay(w.latest!.kg, profile.units).toFixed(1)} ${u}` },
    { label: "Weekly streak", value: <CountUp value={streak.current} />, sub: `best ${streak.best} week${streak.best === 1 ? "" : "s"}` },
  ];

  return (
    <section aria-labelledby="prog-h" className="block block-tangerine mesh grain relative overflow-hidden p-6 md:p-10">
      <div className="relative z-10 grid gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="sticker">This week</p>
            <h1 id="prog-h" className="mega mt-4 break-words">Progress</h1>
          </div>
        </div>
        <p className="max-w-xl text-lg font-semibold md:text-xl">{bits.join(" · ")}.</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          {tiles.map((t, i) => (
            <Reveal key={t.label} delay={0.05 * i} className="min-w-0">
              <dl className="h-full rounded-3xl border-2 border-ink bg-surface p-4">
                <dt className="text-sm font-bold">{t.label}</dt>
                <dd className="mt-1 font-display text-4xl font-extrabold tabular-nums md:text-5xl">{t.value}</dd>
                <dd className="mt-1 text-xs font-semibold text-muted">{t.sub}</dd>
              </dl>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
