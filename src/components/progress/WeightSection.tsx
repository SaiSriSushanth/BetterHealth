"use client";
import { useCallback, useMemo, useState } from "react";
import { Reveal } from "@/components/fx";
import { WeightChart } from "@/components/charts/WeightChart";
import { shortDate } from "@/components/charts/shared";
import { addDays, cleanWeights, RANGES, readPace, weightSummary, type RangeKey } from "@/lib/progress";
import type { Profile, WeightLog } from "@/lib/types";
import { fmt, fmtWeight, RangeChips, signed, toDisplay, unitLabel } from "./format";
import { WeightLogger } from "./WeightLogger";

interface Props {
  profile: Profile;
  today: string;
  weights: WeightLog[];
  setWeight(kg: number, day?: string): Promise<void>;
  deleteWeight(id: string): Promise<void>;
}

const RANGE_KEYS = Object.keys(RANGES) as RangeKey[];
const GOAL_WORD = { lose: "lose weight", maintain: "maintain your weight", gain: "gain weight" } as const;

export function WeightSection({ profile, today, weights, setWeight, deleteWeight }: Props) {
  const [range, setRange] = useState<RangeKey>("30d");
  const units = profile.units;
  const u = unitLabel(units);
  const toUnit = useCallback((kg: number) => toDisplay(kg, units), [units]);
  const days = RANGES[range];
  const s = useMemo(() => weightSummary(weights, today, days), [weights, today, days]);
  const all = useMemo(() => cleanWeights(weights), [weights]);
  const firstEver = all[0] ?? null;
  const latest = all[all.length - 1] ?? null;
  const pace = s.rateKgWk !== null && s.latest ? readPace(s.rateKgWk, s.latest.kg, profile.goal) : null;

  const rangeName = range === "1y" ? "the last year" : `the last ${days} days`;
  const summary = s.points.length
    ? `Weight over ${rangeName}: ${s.points.length} weigh-ins, from ${fmtWeight(s.first!.kg, units)} to ${fmtWeight(s.latest!.kg, units)}` +
      (s.min && s.max ? `, low ${fmtWeight(s.min.kg, units)} on ${shortDate(s.min.day)}, high ${fmtWeight(s.max.kg, units)} on ${shortDate(s.max.day)}.` : ".")
    : `No weigh-ins in ${rangeName}.`;

  let note: string;
  if (!pace) note = s.points.length ? "Log a few more weigh-ins across at least a week to see your weekly rate." : "Your weekly rate shows up after about a week of weigh-ins.";
  else if (pace.tooFast) note = `That's faster than 1% of your body weight a week (${fmt(Math.abs(pace.pctPerWeek), 1)}%). Slower changes are easier to keep and protect muscle, so it may be worth ${pace.direction === "down" ? "eating a little more" : "easing off a little"}.`;
  else if (pace.onTrack) note = pace.direction === "flat" ? "Holding steady, right where you want to be." : `Moving at a sustainable pace, in line with your goal to ${GOAL_WORD[profile.goal]}.`;
  else note = pace.direction === "flat" ? `Holding steady for now. Daily weight bounces around, so give the trend a couple of weeks.` : `The trend is heading ${pace.direction}, away from your goal to ${GOAL_WORD[profile.goal]}. Single days are noisy; watch the trend line.`;

  const changeGood = s.change === null ? null : profile.goal === "lose" ? s.change < 0 : profile.goal === "gain" ? s.change > 0 : Math.abs(s.change) < 0.5;
  const showRef = Math.abs(profile.weightKg - (latest?.kg ?? profile.weightKg)) < 25;

  return (
    <section aria-labelledby="weight-h" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">
      <Reveal><h2 id="weight-h" className="!text-[clamp(2rem,1.3rem+3vw,3.25rem)]">Weight</h2></Reveal>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Reveal className="min-w-0">
          <div className="block block-sun grain relative h-full p-5 md:p-7">
            <WeightLogger today={today} units={units} weights={weights} setWeight={setWeight} deleteWeight={deleteWeight} />
          </div>
        </Reveal>
        <Reveal delay={0.08} className="min-w-0">
          <div className="card h-full min-w-0 p-5 md:p-7">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3>Over time</h3>
              <RangeChips label="Weight chart range" options={RANGE_KEYS} value={range} onChange={setRange} />
            </div>
            {all.length === 0 ? (
              <div className="grid place-items-center gap-3 rounded-3xl border-2 border-dashed border-line px-6 py-14 text-center">
                <svg aria-hidden viewBox="0 0 120 50" className="w-40"><path d="M5 40 C 30 38, 40 18, 60 22 S 95 10, 115 8" fill="none" stroke="var(--ink)" strokeWidth="4" strokeLinecap="round" strokeDasharray="2 10" /><circle cx="115" cy="8" r="6" fill="var(--teal)" stroke="var(--ink)" strokeWidth="2" /></svg>
                <p className="font-display text-2xl font-extrabold">Your line starts with one dot</p>
                <p className="max-w-xs text-muted">Log today&apos;s weight and come back tomorrow. A week of weigh-ins gives you a trend worth reading.</p>
              </div>
            ) : s.points.length === 0 ? (
              <div className="grid place-items-center gap-2 rounded-3xl border-2 border-dashed border-line px-6 py-14 text-center">
                <p className="font-display text-xl font-extrabold">No weigh-ins in {rangeName}</p>
                <p className="text-muted">Your last one was {latest ? shortDate(latest.day, { month: "short", day: "numeric", year: "numeric" }) : "a while ago"}. Pick a longer range or log today.</p>
              </div>
            ) : (
              <WeightChart points={s.points} trend={s.trend} min={s.min} max={s.max} from={addDays(today, -(days - 1))} to={today}
                toUnit={toUnit} unit={u} summary={summary}
                reference={showRef ? { kg: profile.weightKg, label: `Profile ${fmt(toUnit(profile.weightKg), 1)}` } : null} />
            )}
          </div>
        </Reveal>
      </div>

      {all.length > 0 && (
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 md:gap-5 lg:grid-cols-4">
          <Reveal className="min-w-0">
            <div className="block block-lime h-full p-5">
              <p className="font-semibold">Change, {range === "1y" ? "last year" : `last ${days} days`}</p>
              <p className="mt-1 font-display text-4xl font-extrabold tabular-nums">{s.change === null ? "–" : <>{signed(toUnit(s.change))}<span className="text-lg"> {u}</span></>}</p>
              <p className="mt-1 text-sm font-semibold">
                {s.change === null ? "Needs two weigh-ins in this range." : changeGood ? `In the direction of your goal to ${GOAL_WORD[profile.goal]}.` : `Your goal is to ${GOAL_WORD[profile.goal]}.`}
              </p>
            </div>
          </Reveal>
          <Reveal delay={0.05} className="min-w-0 sm:col-span-1 lg:col-span-2">
            <div className={`block h-full p-5 ${pace?.tooFast ? "block-bubble" : "block-teal"}`}>
              <p className="font-semibold">Weekly rate</p>
              <p className="mt-1 font-display text-4xl font-extrabold tabular-nums">
                {s.rateKgWk === null ? "–" : <>{signed(toUnit(s.rateKgWk), 2)}<span className="text-lg"> {u}/week</span></>}
              </p>
              <p className="mt-1 text-sm font-semibold">{pace?.tooFast && <b>Gentle heads-up: </b>}{note}</p>
            </div>
          </Reveal>
          <Reveal delay={0.1} className="min-w-0">
            <div className="card h-full p-5">
              <dl className="grid gap-2">
                <div className="flex items-baseline justify-between gap-3"><dt className="text-sm font-semibold text-muted">Start{firstEver ? `, ${shortDate(firstEver.day)}` : ""}</dt><dd className="font-display text-xl font-extrabold tabular-nums">{firstEver ? fmtWeight(firstEver.kg, units) : "–"}</dd></div>
                <div className="flex items-baseline justify-between gap-3 rowline pt-2"><dt className="text-sm font-semibold text-muted">Now</dt><dd className="font-display text-xl font-extrabold tabular-nums">{latest ? fmtWeight(latest.kg, units) : "–"}</dd></div>
                <div className="flex items-baseline justify-between gap-3 rowline pt-2"><dt className="text-sm font-semibold text-muted">Profile</dt><dd className="font-display text-xl font-extrabold tabular-nums">{fmtWeight(profile.weightKg, units)}</dd></div>
              </dl>
              {firstEver && latest && firstEver.day !== latest.day && (
                <p className="mt-3 text-sm font-semibold text-muted">{signed(toUnit(latest.kg - firstEver.kg))} {u} since you started.</p>
              )}
            </div>
          </Reveal>
        </div>
      )}
    </section>
  );
}
