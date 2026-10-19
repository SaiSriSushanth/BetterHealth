"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "./AppProvider";
import { useReducedMotion } from "@/components/fx";
import { type ReminderContext, type ReminderEvent, dayKey, dueReminders, isSatisfied, markFired, normalizeReminders, readFired } from "@/lib/reminders";

const CHECK_EVERY_MS = 30_000;

function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

/** Shows a system notification when allowed and the tab is in the background. Never throws. */
function notify(e: ReminderEvent, day: string, go: (href: string) => void) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (document.visibilityState === "visible") return; // the in-app banner covers it
    const n = new Notification(e.title, { body: e.body, tag: `betterhealth-${e.id}-${day}`, icon: "/favicon.ico" });
    n.onclick = () => { window.focus(); if (e.href) go(e.href); n.close(); };
  } catch { /* some browsers only allow notifications from a service worker */ }
}

/**
 * Checks reminders every 30 seconds while the app is open (client only).
 * Each reminder fires at most once per day and is skipped if today's log already covers it.
 */
export function ReminderRunner() {
  const { ready, profile, food, workouts, weights } = useApp();
  const router = useRouter();
  const reduce = useReducedMotion();
  const [banners, setBanners] = useState<(ReminderEvent & { day: string })[]>([]);
  const [day, setDay] = useState("");

  const cfg = useMemo(() => normalizeReminders(profile?.reminders), [profile?.reminders]);
  const ctxFor = useCallback((today: string): ReminderContext => ({
    mealsLogged: food.filter((f) => f.day === today).map((f) => f.meal),
    workoutLogged: workouts.some((w) => w.day === today),
    weighedIn: weights.some((w) => w.day === today),
  }), [food, workouts, weights]);

  useEffect(() => {
    if (!ready || !profile || !cfg.enabled) return;
    const tick = () => {
      const now = new Date();
      const today = dayKey(now);
      setDay(today);
      const s = storage();
      const due = dueReminders(now, cfg, ctxFor(today), readFired(s));
      if (!due.length) return;
      for (const e of due) {
        // re-check right before firing so a second tab doesn't double up
        if (readFired(s, [e.id])[e.id] === today) continue;
        markFired(s, e.id, today);
        notify(e, today, (h) => router.push(h));
        setBanners((b) => (b.some((x) => x.id === e.id && x.day === today) ? b : [...b.filter((x) => x.id !== e.id), { ...e, day: today }]));
      }
    };
    tick();
    const id = window.setInterval(tick, CHECK_EVERY_MS);
    const onVis = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [ready, profile, cfg, ctxFor, router]);

  // hide banners that no longer apply: logged since, reminders off, or a new day
  const ctx = day ? ctxFor(day) : null;
  const visible = cfg.enabled && ctx ? banners.filter((b) => b.day === day && !isSatisfied(b, ctx)).slice(-2) : [];
  const dismiss = (id: string) => setBanners((b) => b.filter((x) => x.id !== id));

  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-3 bottom-28 z-40 grid gap-3 md:inset-x-auto md:bottom-6 md:right-6 md:w-[380px]">
      <AnimatePresence initial={false}>
        {visible.map((b) => (
          <motion.div key={b.id} role="status" layout={!reduce}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: 40 }} transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="pointer-events-auto min-w-0 rounded-[24px] border-2 border-ink bg-sun p-4 text-ink shadow-[5px_5px_0_var(--ink)]">
            <p className="font-display text-xl font-extrabold leading-tight">{b.title}</p>
            <p className="mt-1 font-medium">{b.body}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {b.href && <Link href={b.href} className="btn !min-h-[44px] !px-4 !py-1 text-sm" onClick={() => dismiss(b.id)}>{b.action}</Link>}
              <button type="button" className="btn secondary !min-h-[44px] !px-4 !py-1 text-sm" onClick={() => dismiss(b.id)}>Dismiss</button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
