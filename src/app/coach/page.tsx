"use client";
import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/components/AppProvider";
import { Reveal, useReducedMotion } from "@/components/fx";
import { lastDays, musclesTrained, totalsFor } from "@/lib/day";
import { MUSCLES } from "@/lib/exercises";
import type { Nutrients, Targets } from "@/lib/types";

interface Read { wins: string[]; gap: string; action: string; reply: string; ai: boolean }

const IDEAS = ["What should I eat for dinner to hit my protein?", "Am I eating enough fiber?", "What should I train next?"];

/** Rule-based coach used when AI is off or unavailable. Same shape as the AI answer. */
function ruleCoach(eaten: Nutrients, t: Targets, sessions: number, untrained: string[]): Read {
  const wins: string[] = [];
  if (eaten.kcal > 0 && eaten.kcal <= t.kcal * 1.05) wins.push("You're inside your calorie budget.");
  if (eaten.proteinG >= t.proteinG * 0.9) wins.push("Protein is on target.");
  if (eaten.fiberG >= t.fiberG * 0.9) wins.push("Fiber is on target.");
  if (sessions >= 3) wins.push(`${sessions} workouts this week. Steady.`);
  if (!wins.length) wins.push(eaten.kcal === 0 ? "A fresh day is a good start." : "You're logging, and that's the habit that works.");
  const protein = t.proteinG - eaten.proteinG;
  const gap = eaten.kcal === 0 ? "Nothing is logged yet today."
    : protein > 15 ? `Protein is ${Math.round(protein)}g short.`
    : eaten.kcal > t.kcal * 1.1 ? `You're ${Math.round(eaten.kcal - t.kcal)} kcal over today.`
    : eaten.fiberG < t.fiberG * 0.5 ? "Fiber is running low."
    : "No big gaps today.";
  const action = untrained.length && sessions < 4 ? `Train ${untrained[0].toLowerCase()} next. It's still pale.`
    : protein > 15 ? "Add eggs, yogurt, paneer, tofu or chicken to your next meal." : "Repeat what worked today.";
  return { wins: wins.slice(0, 3), gap, action, reply: "Here's your day, read straight from your logs.", ai: false };
}

/** Little paper-scrap blob that wobbles and blinks. Pure SVG + motion. */
function CoachAvatar({ thinking = false }: { thinking?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.div aria-hidden className="relative size-14 shrink-0 md:size-16"
      animate={reduce ? undefined : { rotate: thinking ? [-6, 6, -6] : [-3, 3, -3], y: [0, -4, 0] }}
      transition={{ duration: thinking ? 0.9 : 3.4, repeat: Infinity, ease: "easeInOut" }}>
      <svg viewBox="0 0 64 64" className="size-full">
        <motion.path fill="#d7ff3f" stroke="#0b1f1d" strokeWidth="3" strokeLinejoin="round"
          d="M32 4c11 0 20 5 24 14 4 8 4 20-2 28-6 9-16 14-26 13C16 58 7 50 5 39 2 27 6 14 16 8c4-3 10-4 16-4z"
          animate={reduce ? undefined : { d: [
            "M32 4c11 0 20 5 24 14 4 8 4 20-2 28-6 9-16 14-26 13C16 58 7 50 5 39 2 27 6 14 16 8c4-3 10-4 16-4z",
            "M30 5c12-1 22 6 25 16 3 9 1 19-5 27-7 8-17 13-27 10C12 55 6 46 6 36 6 24 11 12 20 8c3-2 6-3 10-3z",
            "M32 4c11 0 20 5 24 14 4 8 4 20-2 28-6 9-16 14-26 13C16 58 7 50 5 39 2 27 6 14 16 8c4-3 10-4 16-4z",
          ] }}
          transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }} />
        <motion.g style={{ transformOrigin: "32px 30px" }} animate={reduce ? undefined : { scaleY: [1, 1, 0.1, 1, 1] }} transition={{ duration: 4, repeat: Infinity, times: [0, 0.45, 0.5, 0.55, 1] }}>
          <circle cx="23" cy="30" r="3.5" fill="#0b1f1d" />
          <circle cx="41" cy="30" r="3.5" fill="#0b1f1d" />
        </motion.g>
        <path d={thinking ? "M26 43h12" : "M24 41c4 6 12 6 16 0"} stroke="#0b1f1d" strokeWidth="3" strokeLinecap="round" fill="none" />
        <path d="M44 6l8-3-2 9z" fill="#ff5a1f" stroke="#0b1f1d" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </motion.div>
  );
}

function TypingDots() {
  const reduce = useReducedMotion();
  return (
    <div role="status" aria-label="Coach is reading your day" className="flex items-center gap-4">
      <CoachAvatar thinking />
      <div className="relative flex items-center gap-2 rounded-[28px] rounded-bl-md border-2 border-ink bg-white px-6 py-5">
        {[0, 1, 2].map((i) => (
          <motion.i key={i} className="block size-3.5 rounded-full bg-tangerine" style={{ opacity: reduce ? 0.8 : undefined }}
            animate={reduce ? undefined : { y: [0, -10, 0], backgroundColor: ["#ff5a1f", "#0fb5a6", "#ff5a1f"] }}
            transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }} />
        ))}
        <span className="ml-2 text-sm font-semibold text-ink2">Reading your day…</span>
      </div>
    </div>
  );
}

const pop = {
  hidden: { opacity: 0, y: 40, scale: 0.9, rotate: -2 },
  show: { opacity: 1, y: 0, scale: 1, rotate: 0 },
};

export default function CoachPage() {
  const { ready, today, profile, targets, food, workouts, cloud } = useApp();
  const reduce = useReducedMotion();
  const [out, setOut] = useState<Read | null>(null);
  const [q, setQ] = useState("");
  const [asked, setAsked] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (!ready || !today) return <div role="status" aria-label="Loading" className="piece h-64 animate-pulse" />;
  if (!profile || !targets) {
    return (
      <div className="block block-sun mesh grid min-w-0 gap-4 p-6 md:p-10">
        <h1 className="text-[clamp(2.4rem,1rem+7vw,5rem)]">Your coach needs a plate first.</h1>
        <p className="max-w-prose text-lg">Set your goals so the coach has numbers to read.</p>
        <div><Link href="/" className="btn">Set up my plan</Link></div>
      </div>
    );
  }

  const eaten = totalsFor(food, today);
  const week = lastDays(today);
  const trained = musclesTrained(workouts, week);
  const sessions = new Set(workouts.filter((w) => week.includes(w.day)).map((w) => w.id)).size;
  const untrained = MUSCLES.filter((m) => !trained.has(m.id)).map((m) => m.label);

  async function ask() {
    setBusy(true); setNote(null); setOut(null); setAsked(q.trim());
    const local = ruleCoach(eaten, targets!, sessions, untrained);
    if (cloud) {
      try {
        const r = await fetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          question: q || undefined, goal: profile!.goal, targets, today: eaten,
          foods: food.filter((f) => f.day === today).map((f) => f.name).slice(0, 30),
          workoutsThisWeek: sessions, musclesTrainedThisWeek: [...trained],
        }) });
        const j = await r.json();
        if (j.reply) { setOut({ ...j, ai: true }); setBusy(false); return; }
        setNote(j.error ?? null);
      } catch { setNote("Could not reach the AI coach."); }
    }
    setOut(local); setBusy(false);
  }

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-7">
      <header className="flex min-w-0 items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-[clamp(3.5rem,1rem+14vw,9rem)] leading-[.85]">Coach</h1>
          <p className="mt-3 max-w-prose text-lg text-ink2">Reads what you ate and trained, then tells you what to do next. Ask it anything about your day.</p>
        </div>
        <div className="hidden sm:block"><CoachAvatar /></div>
      </header>

      <Reveal>
        <section className="block block-bubble min-w-0 p-5 md:p-8" aria-label="Ask the coach">
          <label className="lbl !text-base" htmlFor="cq">Ask a question (optional)</label>
          <input id="cq" className="field !min-h-[64px] !text-xl" maxLength={300} value={q} onChange={(e) => setQ(e.target.value)} placeholder="What should I eat for dinner to hit my protein?" disabled={!cloud} />
          {cloud && (
            <div className="hscroll mt-3 pb-1" role="group" aria-label="Question ideas">
              {IDEAS.map((s) => <button key={s} className="chip !text-sm" onClick={() => setQ(s)}>{s}</button>)}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <motion.button className="btn !min-h-[58px] !px-8 !text-lg" onClick={ask} disabled={busy} whileTap={reduce ? undefined : { scale: 0.94 }}>{busy ? "Reading your day…" : "Read my day"}</motion.button>
            {!cloud && <span className="rounded-2xl bg-white px-3 py-2 text-sm font-bold">Sign in to talk to the AI coach. Until then you get a rule-based read.</span>}
          </div>
        </section>
      </Reveal>

      <p role="status" className="card border-l-8 border-l-bubble p-4 font-semibold empty:hidden">{note}</p>

      <AnimatePresence mode="wait">
        {(busy || out) && (
          <motion.section key={busy ? "busy" : "out"} aria-label="Coach read" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5"
            initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.div className="justify-self-end max-w-[85%]" initial={reduce ? false : { opacity: 0, x: 40, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }} transition={{ type: "spring", stiffness: 300, damping: 22 }}>
              <p className="rounded-[28px] rounded-br-md bg-ink px-5 py-3 text-lg font-semibold text-white [overflow-wrap:anywhere]">{asked || "Read my day"}</p>
            </motion.div>
            {busy && <TypingDots />}
            {!busy && out && (
              <motion.div className="grid min-w-0 gap-4" initial="hidden" animate="show" transition={{ staggerChildren: reduce ? 0 : 0.14, delayChildren: 0.1 }}>
                <motion.div variants={pop} transition={{ type: "spring", stiffness: 220, damping: 18 }} className="flex min-w-0 items-start gap-4">
                  <CoachAvatar />
                  <p className="min-w-0 rounded-[28px] rounded-tl-md border-2 border-ink bg-white px-5 py-4 text-xl font-bold">{out.reply}</p>
                </motion.div>
                <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[1.3fr_1fr_1fr]">
                  <motion.div variants={pop} transition={{ type: "spring", stiffness: 220, damping: 18 }} className="block block-teal min-w-0 p-5 md:p-6">
                    <h2>What went well</h2>
                    <ul className="mt-3 grid gap-2">
                      {out.wins.map((w, i) => (
                        <li key={i} className="flex min-w-0 gap-2 font-semibold">
                          <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 size-6 shrink-0"><circle cx="12" cy="12" r="11" fill="#fff" stroke="#0b1f1d" strokeWidth="2" /><path d="M7 12.5l3.5 3.5L17 9" fill="none" stroke="#0b1f1d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          <span className="min-w-0">{w}</span>
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                  <motion.div variants={pop} transition={{ type: "spring", stiffness: 220, damping: 18 }} className="block block-sun min-w-0 p-5 md:p-6">
                    <h2>What&apos;s missing</h2>
                    <p className="mt-3 text-lg font-semibold">{out.gap}</p>
                  </motion.div>
                  <motion.div variants={pop} transition={{ type: "spring", stiffness: 220, damping: 18 }} className="block block-tangerine min-w-0 p-5 md:p-6">
                    <h2>Do this next</h2>
                    <p className="mt-3 text-lg font-semibold">{out.action}</p>
                  </motion.div>
                </div>
                <motion.p variants={pop} className="text-sm text-ink2">{out.ai ? "Written by AI from your logs." : "Generated from your logs, no AI."} Not medical advice.</motion.p>
              </motion.div>
            )}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
