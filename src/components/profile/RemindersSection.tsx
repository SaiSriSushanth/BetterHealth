"use client";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/components/fx";
import { DEFAULT_TIMES, type ReminderKind, formatTime, nextReminder } from "@/lib/reminders";
import type { Reminders } from "@/lib/types";

type TimeKey = "breakfast" | "lunch" | "dinner" | "workout" | "weighIn";
type Perm = "unsupported" | "default" | "granted" | "denied";

const ROWS: { k: TimeKey; label: string; sub: string }[] = [
  { k: "breakfast", label: "Breakfast", sub: "Skipped if breakfast is already logged" },
  { k: "lunch", label: "Lunch", sub: "Skipped if lunch is already logged" },
  { k: "dinner", label: "Dinner", sub: "Skipped if dinner is already logged" },
  { k: "workout", label: "Workout", sub: "Skipped if you've logged a workout today" },
  { k: "weighIn", label: "Weigh-in", sub: "Mondays only. Skipped if you've already weighed in" },
];

const KIND_LABEL: Record<ReminderKind, string> = { breakfast: "breakfast", lunch: "lunch", dinner: "dinner", workout: "workout", weighIn: "weigh-in", water: "water" };

/** Accessible on/off switch with a 44px target. */
export function Switch({ on, onChange, label, disabled, id }: { on: boolean; onChange: (v: boolean) => void; label: string; disabled?: boolean; id?: string }) {
  const reduce = useReducedMotion();
  return (
    <button type="button" role="switch" id={id} aria-checked={on} aria-label={label} disabled={disabled} onClick={() => onChange(!on)}
      className="group grid min-h-[44px] min-w-[64px] shrink-0 place-items-center disabled:cursor-not-allowed disabled:opacity-40">
      <span className={`relative flex h-8 w-14 items-center rounded-full border-2 border-ink p-0.5 ${on ? "justify-end bg-ink" : "justify-start bg-surface"}`}>
        <motion.span layout={!reduce} transition={{ type: "spring", stiffness: 500, damping: 32 }}
          className={`block size-6 rounded-full border-2 border-ink ${on ? "bg-lime" : "bg-bg"}`} />
      </span>
    </button>
  );
}

function usePermission(): [Perm, (p: Perm) => void] {
  const [perm, setPerm] = useState<Perm>("unsupported");
  useEffect(() => {
    try { setPerm(typeof Notification === "undefined" ? "unsupported" : (Notification.permission as Perm)); } catch { setPerm("unsupported"); }
  }, []);
  return [perm, setPerm];
}

export function RemindersSection({ value, onChange, dirty, onTest }: {
  value: Reminders; onChange: (r: Reminders) => void; dirty: boolean;
  /** show an in-app test banner/toast */
  onTest: (title: string, body: string) => void;
}) {
  const [perm, setPerm] = usePermission();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id); }, []);
  const set = (patch: Partial<Reminders>) => onChange({ ...value, ...patch });
  // remember the last time per row so switching a row off and on again keeps it
  const [memory, setMemory] = useState<Record<TimeKey, string>>(() => ({ ...DEFAULT_TIMES, ...Object.fromEntries(ROWS.filter((r) => value[r.k]).map((r) => [r.k, value[r.k] as string])) }));

  async function ask() {
    try {
      if (typeof Notification === "undefined") return;
      const p = await Notification.requestPermission();
      setPerm(p as Perm);
    } catch { /* ignore */ }
  }
  function test() {
    const title = "Test reminder", body = "This is how BetterHealth reminders look.";
    try {
      if (perm === "granted") { new Notification(title, { body, tag: "betterhealth-test", icon: "/favicon.ico" }); }
    } catch { /* fall through to the in-app version */ }
    onTest(title, perm === "granted" ? "A system notification was sent too. If you didn't see it, check your browser's site settings." : body);
  }

  const upcoming = now && value.enabled ? nextReminder(now, value) : null;

  return (
    <section aria-labelledby="rem-h" className="block block-bubble grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 p-5 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="rem-h" className="text-[clamp(1.9rem,1.2rem+2.5vw,3rem)]">Reminders</h2>
          <p className="mt-2 max-w-prose font-medium">Nudges to log meals, train, drink water and weigh in. They only show up for things you haven&apos;t logged yet.</p>
        </div>
        <label className="flex min-h-[44px] items-center gap-2 rounded-full border-2 border-ink bg-surface py-1 pl-4 pr-1 font-bold" htmlFor="rem-on">
          {value.enabled ? "On" : "Off"}
          <Switch id="rem-on" on={value.enabled} onChange={(v) => set({ enabled: v })} label="Reminders" />
        </label>
      </div>

      <div className="grid min-w-0 gap-3 rounded-[24px] border-2 border-ink bg-surface p-4 md:p-5">
        <h3 className="text-xl">How reminders reach you</h3>
        <p className="max-w-prose">
          BetterHealth is a web app, so it can only remind you while it&apos;s open in a browser tab or installed on your home screen. If it&apos;s fully closed, nothing will arrive. There&apos;s no server push yet.
        </p>
        <p className="max-w-prose">While the app is open you&apos;ll get a banner in the corner. Allow notifications to also get a system alert when the tab is in the background.</p>
        <div className="flex flex-wrap items-center gap-3">
          {perm === "default" && <button type="button" className="btn" onClick={ask}>Allow notifications</button>}
          {perm === "granted" && <span className="sticker !rotate-0">Notifications allowed</span>}
          {perm === "denied" && <p className="font-bold">Notifications are blocked for this site. You can allow them in your browser&apos;s site settings. Banners still work.</p>}
          {perm === "unsupported" && <p className="font-bold">This browser can&apos;t show notifications here. Banners still work.</p>}
          <button type="button" className="btn secondary" onClick={test}>Send a test</button>
        </div>
      </div>

      <ul className="grid min-w-0 gap-3" aria-label="Reminder times">
        {ROWS.map((r) => {
          const t = value[r.k];
          const id = `rem-${r.k}`;
          return (
            <li key={r.k} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-[22px] border-2 border-ink bg-surface p-3 pl-4">
              <div className="min-w-0 flex-1 basis-48">
                <p className="text-lg font-bold" id={`${id}-l`}>{r.label}</p>
                <p className="text-sm text-ink2">{r.sub}</p>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor={id} className="sr-only">{r.label} time</label>
                <input id={id} type="time" className="field !min-h-[48px] w-[8.5rem] !py-1" value={t ?? memory[r.k]} disabled={t === null}
                  onChange={(e) => { const v = e.target.value; if (!v) return; setMemory((m) => ({ ...m, [r.k]: v })); set({ [r.k]: v } as Partial<Reminders>); }} />
                <Switch on={t !== null} label={`${r.label} reminder`} onChange={(v) => set({ [r.k]: v ? memory[r.k] : null } as Partial<Reminders>)} />
              </div>
            </li>
          );
        })}
        <li className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 rounded-[22px] border-2 border-ink bg-surface p-3 pl-4">
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-lg font-bold">Water</p>
            <p className="text-sm text-ink2">Every 2 hours from 9:00 am to 9:00 pm</p>
          </div>
          <Switch on={value.water} label="Water reminders" onChange={(v) => set({ water: v })} />
        </li>
      </ul>

      <p className="font-bold" aria-live="polite">
        {!value.enabled ? "Reminders are off. Switch them on above to use these times." : upcoming ? `Next today: ${KIND_LABEL[upcoming.kind]} at ${formatTime(upcoming.time)}.` : "Nothing else scheduled for today."}
        {dirty && " Save your changes to apply them."}
      </p>
    </section>
  );
}
