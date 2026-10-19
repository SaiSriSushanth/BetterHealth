"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CountUp, Reveal } from "@/components/fx";
import { CalorieBars } from "@/components/charts/CalorieBars";
import { MacroDonut } from "@/components/charts/MacroDonut";
import { shortDate } from "@/components/charts/shared";
import { calorieStats, dailyTotals, macroSplit, perKg } from "@/lib/progress";
import type { FoodLog, Profile, Targets } from "@/lib/types";
import { fmt, RangeChips } from "./format";

const OPTS = ["7d", "30d"] as const;

export function CaloriesSection({ profile, targets, food, today, weightKg }: { profile: Profile; targets: Targets; food: FoodLog[]; today: string; weightKg: number }) {
  const [range, setRange] = useState<(typeof OPTS)[number]>("7d");
  const n = range === "7d" ? 7 : 30;
  const days = useMemo(() => dailyTotals(food, today, n), [food, today, n]);
  const st = calorieStats(days, targets.kcal);
  const mac = macroSplit(days);
  const pKg = perKg(mac.avg.proteinG, weightKg);
  const pTarget = perKg(targets.proteinG, profile.weightKg);
  const pPct = pTarget ? Math.min(100, (pKg / pTarget) * 100) : 0;
  const longDay = (d: string) => shortDate(d, { weekday: "short", month: "short", day: "numeric" });
  const summary = st.loggedDays
    ? `Calories over the last ${n} days: logged on ${st.loggedDays} days, averaging ${Math.round(st.avgKcal).toLocaleString()} kcal against a ${targets.kcal.toLocaleString()} kcal target; ${st.onTarget} days within 10% of target.`
    : `No food logged in the last ${n} days.`;

  return (
    <section aria-labelledby="cal-h" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">
      <Reveal className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="cal-h" className="!text-[clamp(2rem,1.3rem+3vw,3.25rem)]">Calories</h2>
        <RangeChips label="Calories range" options={OPTS} value={range} onChange={setRange} />
      </Reveal>

      {st.loggedDays === 0 ? (
        <Reveal>
          <div className="block block-bubble flex flex-wrap items-center justify-between gap-4 p-6 md:p-8">
            <div className="max-w-md">
              <p className="font-display text-2xl font-extrabold">Nothing logged in the last {n} days</p>
              <p className="mt-1 font-medium">Log a meal or two and this fills with your daily calories, best days and macro split.</p>
            </div>
            <Link href="/food" className="btn">Log food</Link>
          </div>
        </Reveal>
      ) : (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <Reveal className="min-w-0">
            <div className="card h-full min-w-0 p-5 md:p-7">
              <h3 className="mb-4">Eaten vs target</h3>
              <CalorieBars key={range} days={days} target={targets.kcal} summary={summary} />
              <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl bg-bg p-3"><dt className="text-xs font-bold text-muted">Daily average</dt><dd className="font-display text-2xl font-extrabold tabular-nums"><CountUp value={st.avgKcal} /></dd></div>
                <div className="rounded-2xl bg-bg p-3"><dt className="text-xs font-bold text-muted">On target</dt><dd className="font-display text-2xl font-extrabold tabular-nums"><CountUp value={st.onTarget} /><span className="text-base">/{st.loggedDays} days</span></dd></div>
                <div className="rounded-2xl bg-bg p-3"><dt className="text-xs font-bold text-muted">Closest day</dt><dd className="font-semibold">{st.best ? <><b className="font-display text-lg">{Math.round(st.best.kcal).toLocaleString()}</b> <span className="block text-xs text-muted">{longDay(st.best.day)}</span></> : "–"}</dd></div>
                <div className="rounded-2xl bg-bg p-3"><dt className="text-xs font-bold text-muted">Furthest off</dt><dd className="font-semibold">{st.worst ? <><b className="font-display text-lg">{Math.round(st.worst.kcal).toLocaleString()}</b> <span className="block text-xs text-muted">{longDay(st.worst.day)}</span></> : "–"}</dd></div>
              </dl>
              <p className="mt-3 text-xs font-semibold text-muted">Averages only count days you logged. &ldquo;On target&rdquo; means within 10% of {targets.kcal.toLocaleString()} kcal.</p>
            </div>
          </Reveal>

          <div className="grid min-w-0 gap-4 md:gap-5">
            <Reveal delay={0.06} className="min-w-0">
              <div className="card h-full min-w-0 p-5 md:p-7">
                <h3 className="mb-4">Macro split</h3>
                <MacroDonut key={range}
                  center={Math.round(st.avgKcal).toLocaleString()} sub="avg kcal a day"
                  summary={`Average share of calories: protein ${Math.round(mac.share.protein * 100)}%, carbs ${Math.round(mac.share.carbs * 100)}%, fat ${Math.round(mac.share.fat * 100)}%.`}
                  slices={[
                    { label: "Protein", value: mac.share.protein, color: "var(--teal)", detail: `${Math.round(mac.avg.proteinG)}g a day` },
                    { label: "Carbs", value: mac.share.carbs, color: "var(--sun)", detail: `${Math.round(mac.avg.carbsG)}g a day` },
                    { label: "Fat", value: mac.share.fat, color: "var(--bubble)", detail: `${Math.round(mac.avg.fatG)}g a day` },
                  ]} />
              </div>
            </Reveal>
            <Reveal delay={0.12} className="min-w-0">
              <div className="block block-teal h-full p-5 md:p-6">
                <p className="font-semibold">Protein per kg of body weight</p>
                <p className="mt-1 font-display text-4xl font-extrabold tabular-nums">{fmt(pKg, 1)}<span className="text-lg"> g/kg</span></p>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-ink/15" role="progressbar" aria-label="Protein per kg vs target"
                  aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pPct)} aria-valuetext={`${fmt(pKg, 1)} of ${fmt(pTarget, 1)} g per kg`}>
                  <div className="h-full rounded-full bg-ink" style={{ width: `${pPct}%` }} />
                </div>
                <p className="mt-2 text-sm font-semibold">Target {fmt(pTarget, 1)} g/kg ({targets.proteinG}g a day). {pKg >= pTarget * 0.9 ? "You're getting there consistently." : "A protein source at each meal closes the gap."}</p>
              </div>
            </Reveal>
          </div>
        </div>
      )}
    </section>
  );
}
