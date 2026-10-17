"use client";
import Link from "next/link";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { useApp } from "@/components/AppProvider";
import { Onboarding } from "@/components/Onboarding";
import { PlateRing } from "@/components/PlateRing";
import { CountUp, Magnetic, Marquee, Reveal, Tilt, useWebGL } from "@/components/fx";
import { lastDays, musclesTrained, totalsFor } from "@/lib/day";
import { MUSCLES } from "@/lib/exercises";

const HeroScene = dynamic(() => import("@/components/three/HeroScene").then((m) => m.HeroScene), { ssr: false });

function Skeleton() {
  return <div role="status" aria-label="Loading" className="block block-sun h-72 animate-pulse" />;
}

function Macro({ label, value, target, unit, bg }: { label: string; value: number; target: number; unit: string; bg: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(target, 1)) * 100));
  return (
    <Tilt className={`block ${bg} p-5`}>
      <p className="font-semibold">{label}</p>
      <p className="mt-1 font-display text-4xl font-extrabold tracking-tight"><CountUp value={value} />
        <span className="text-lg font-bold">{unit}</span></p>
      <p className="text-sm font-medium">of {target}{unit}</p>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-ink/15" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-valuetext={`${Math.round(value)} of ${target}${unit}`}>
        <motion.div className="h-full rounded-full bg-ink" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ type: "spring", stiffness: 60, damping: 16, delay: 0.3 }} />
      </div>
    </Tilt>
  );
}

export default function Today() {
  const { ready, profile, targets, food, workouts, today, error, canImport, importLocal, email } = useApp();
  const gl = useWebGL();
  if (!ready || !today) return <Skeleton />;
  if (error) return <p role="alert" className="block block-bubble p-5 font-semibold">{error}</p>;
  if (!profile || !targets) {
    return (
      <>
        {canImport && (
          <div className="block block-sun mb-6 flex flex-wrap items-center justify-between gap-3 p-4">
            <span className="font-bold">Found data from before you signed in.</span>
            <button className="btn" onClick={importLocal}>Import it to my account</button>
          </div>
        )}
        <Onboarding />
      </>
    );
  }
  const eaten = totalsFor(food, today);
  const week = lastDays(today);
  const trained = musclesTrained(workouts, week);
  const sessionDays = new Set(workouts.filter((w) => week.includes(w.day)).map((w) => w.day));
  const sessions = workouts.filter((w) => week.includes(w.day)).length;
  const untrained = MUSCLES.filter((m) => !trained.has(m.id));
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Morning" : hour < 18 ? "Hey" : "Evening";
  const dateLabel = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  const loggedToday = food.some((f) => f.day === today);
  const left = Math.round(targets.kcal - eaten.kcal);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:gap-5">
      {/* hero */}
      <section className="block block-sun mesh grain relative grid min-h-[430px] overflow-hidden md:min-h-[460px] md:grid-cols-[1.1fr_1fr]" aria-labelledby="hero-h">
        <div className="relative z-10 flex flex-col justify-between gap-6 p-6 md:p-10">
          <p className="sticker self-start">{dateLabel}</p>
          <div>
            <h1 id="hero-h" className="mega break-words">{greet}, {profile.name}.</h1>
            <p className="mt-4 max-w-sm text-lg font-semibold">
              {loggedToday ? <><b>{left >= 0 ? left.toLocaleString() : Math.abs(left).toLocaleString()}</b> kcal {left >= 0 ? "left to eat today." : "over today. No stress, tomorrow's a new plate."}</> : "Nothing logged yet. Breakfast is waiting."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Magnetic><Link href="/food" className="btn hot">Log food</Link></Magnetic>
            <Magnetic><Link href="/train" className="btn secondary">Start a workout</Link></Magnetic>
          </div>
        </div>
        <div className="relative -mt-6 h-[260px] md:mt-0 md:h-auto">
          {gl ? <HeroScene className="absolute inset-0" /> : (
            <div aria-hidden className="absolute inset-0 grid place-items-center"><div className="float size-40 rounded-full bg-tangerine" /></div>
          )}
        </div>
      </section>

      <div className="-mx-4 -rotate-1 overflow-hidden bg-ink py-3 font-display text-2xl font-extrabold text-lime md:mx-0 md:rounded-full" aria-hidden>
        <Marquee items={["Eat the rainbow", "Train every muscle", "Drink water", "Log it, learn it", "Sleep is a workout", "Protein first"]} />
      </div>

      {/* bento */}
      <div className="grid gap-4 md:grid-cols-6 md:gap-5">
        <Reveal className="md:col-span-3 md:row-span-2">
          <Tilt className="block block-ink grain relative h-full p-6 md:p-8">
            <h2 className="mb-4">Today&apos;s plate</h2>
            <PlateRing eaten={eaten} targets={targets} />
            <ul className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-1 text-sm font-semibold text-white">
              <li><i className="mr-1.5 inline-block size-2.5 rounded-full bg-teal" />Protein</li>
              <li><i className="mr-1.5 inline-block size-2.5 rounded-full bg-sun" />Carbs</li>
              <li><i className="mr-1.5 inline-block size-2.5 rounded-full bg-bubble" />Fat</li>
            </ul>
            <p className="mt-3 text-center text-white/75"><b className="text-white">{Math.round(eaten.kcal).toLocaleString()}</b> of {targets.kcal.toLocaleString()} kcal eaten</p>
          </Tilt>
        </Reveal>

        <Reveal delay={0.05} className="md:col-span-3"><Macro label="Protein" value={eaten.proteinG} target={targets.proteinG} unit="g" bg="block-teal" /></Reveal>
        <div className="grid grid-cols-2 gap-4 md:col-span-3 md:gap-5">
          <Reveal delay={0.1}><Macro label="Carbs" value={eaten.carbsG} target={targets.carbsG} unit="g" bg="block-sun" /></Reveal>
          <Reveal delay={0.15}><Macro label="Fat" value={eaten.fatG} target={targets.fatG} unit="g" bg="block-bubble" /></Reveal>
        </div>

        <Reveal className="md:col-span-4">
          <div className="card h-full p-6" role="group" aria-labelledby="week-h">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="week-h">This week</h2>
              <span className="text-sm font-semibold text-muted">{sessions} workout{sessions === 1 ? "" : "s"} · {trained.size}/{MUSCLES.length} muscles</span>
            </div>
            <ol className="mt-5 grid grid-cols-7 gap-2" aria-label="Last 7 days">
              {week.map((d, i) => {
                const on = sessionDays.has(d);
                const label = new Date(d + "T12:00:00").toLocaleDateString(undefined, { weekday: "short" });
                return (
                  <li key={d} className="grid justify-items-center gap-1.5 text-xs font-bold text-muted">
                    <motion.span aria-label={`${d}: ${on ? "trained" : "rest"}`}
                      initial={{ scale: 0.6, opacity: 0 }} whileInView={{ scale: 1, opacity: 1 }} viewport={{ once: true }}
                      transition={{ type: "spring", stiffness: 300, damping: 14, delay: i * 0.06 }}
                      className={`grid aspect-square w-full max-w-12 place-items-center rounded-2xl border-2 border-ink text-lg font-black ${on ? "bg-teal text-ink" : "bg-bg text-transparent"}`}>✓</motion.span>
                    {label}
                  </li>
                );
              })}
            </ol>
            {sessions > 0 && untrained.length > 0 && <p className="mt-4 text-sm text-muted">Still waiting: {untrained.slice(0, 4).map((m) => m.label.toLowerCase()).join(", ")}{untrained.length > 4 ? "…" : ""}.</p>}
          </div>
        </Reveal>

        <Reveal delay={0.1} className="md:col-span-2">
          <Tilt className="block block-bubble h-full p-6">
            <h2>Your coach</h2>
            <p className="mt-2 font-medium">Get a read on today: what went well, what&apos;s missing, what to do next.</p>
            <div className="mt-5"><Magnetic><Link href="/coach" className="btn">Read my day</Link></Magnetic></div>
          </Tilt>
        </Reveal>
      </div>
      <p className="sr-only">{email ? "Synced to your account." : "Saved on this device."}</p>
    </div>
  );
}
