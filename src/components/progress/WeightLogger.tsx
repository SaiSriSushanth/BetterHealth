"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useState } from "react";
import { burst } from "@/components/fx";
import { addDays, checkWeight } from "@/lib/progress";
import type { WeightLog } from "@/lib/types";
import { shortDate } from "@/components/charts/shared";
import { fmtWeight, fromDisplay, toDisplay, unitLabel, type Units } from "./format";

interface Props {
  today: string;
  units: Units;
  weights: WeightLog[];
  setWeight(kg: number, day?: string): Promise<void>;
  deleteWeight(id: string): Promise<void>;
}

/** Big friendly weigh-in form: today by default, any of the last 365 days, plus recent entries to edit or delete. */
export function WeightLogger({ today, units, weights, setWeight, deleteWeight }: Props) {
  const uid = useId();
  const reduce = useReducedMotion();
  const u = unitLabel(units);
  const [day, setDay] = useState(today);
  const existing = weights.find((w) => w.day === day) ?? null;
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "error" | "warn" | "ok"; text: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const minDay = addDays(today, -364);

  // prefill with the stored value whenever the chosen day changes
  useEffect(() => {
    setValue(existing ? toDisplay(existing.kg, units).toFixed(1) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day, existing?.kg, units]);
  useEffect(() => { setMsg(null); setConfirmDel(null); }, [day]);

  const parsed = Number(value.replace(",", "."));
  const check = value.trim() ? checkWeight(fromDisplay(parsed, units)) : null;
  const isToday = day === today;

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!value.trim()) { setMsg({ kind: "error", text: `Enter your weight in ${u}.` }); return; }
    if (!check || !check.ok) { setMsg({ kind: "error", text: check && !check.ok ? check.error : "Enter a number." }); return; }
    if (day < minDay || day > today) { setMsg({ kind: "error", text: "Pick a date within the last year, not in the future." }); return; }
    setBusy(true);
    try {
      await setWeight(check.kg, day);
      setMsg({ kind: "ok", text: `${existing ? "Updated" : "Saved"} ${fmtWeight(check.kg, units)} for ${isToday ? "today" : shortDate(day)}.${check.warning ? " It's outside the usual range, so check it's right." : ""}` });
      const r = (e.nativeEvent as SubmitEvent).submitter?.getBoundingClientRect();
      if (r && !existing) burst(r.left + r.width / 2, r.top + r.height / 2, 28);
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Could not save. Try again." });
    } finally { setBusy(false); }
  }

  async function remove(w: WeightLog) {
    setBusy(true);
    try {
      await deleteWeight(w.id);
      setConfirmDel(null);
      setMsg({ kind: "ok", text: `Deleted the entry for ${w.day === today ? "today" : shortDate(w.day)}.` });
    } catch (err) {
      setMsg({ kind: "error", text: err instanceof Error ? err.message : "Could not delete. Try again." });
    } finally { setBusy(false); }
  }

  const recent = [...weights].sort((a, b) => b.day.localeCompare(a.day));
  const shown = showAll ? recent.slice(0, 60) : recent.slice(0, 5);
  const err = msg?.kind === "error" || (check && !check.ok);

  return (
    <div className="grid min-w-0 gap-5">
      <form onSubmit={submit} noValidate className="grid min-w-0 gap-4">
        <div>
          <label htmlFor={`${uid}-w`} className="lbl">{isToday ? "Today's weight" : `Weight on ${shortDate(day, { weekday: "short", month: "short", day: "numeric" })}`}</label>
          <div className="relative">
            <input id={`${uid}-w`} className="field !min-h-[76px] !pr-16 !font-display !text-4xl !font-extrabold tabular-nums" inputMode="decimal" autoComplete="off"
              placeholder={units === "imperial" ? "160.0" : "72.0"} value={value} aria-invalid={Boolean(err) || undefined} aria-describedby={`${uid}-msg`}
              onChange={(e) => { setValue(e.target.value.replace(/[^\d.,]/g, "")); if (msg?.kind !== "ok") setMsg(null); }} />
            <span aria-hidden className="pointer-events-none absolute right-5 top-1/2 -translate-y-1/2 font-display text-xl font-extrabold">{u}</span>
          </div>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <div className="min-w-0">
            <label htmlFor={`${uid}-d`} className="lbl">Date</label>
            <input id={`${uid}-d`} type="date" className="field" min={minDay} max={today} value={day} required
              onChange={(e) => { const v = e.target.value; if (v) setDay(v > today ? today : v < minDay ? minDay : v); }} />
          </div>
          <button type="submit" className="btn hot" disabled={busy}>{existing ? "Update entry" : isToday ? "Log today's weight" : "Save weight"}</button>
        </div>
        {!isToday && <button type="button" className="btn ghost justify-self-start !px-0" onClick={() => setDay(today)}>Back to today</button>}
        <p id={`${uid}-msg`} role="status" aria-live="polite" className="min-h-6 text-sm font-semibold">
          {msg ? (
            <span className={msg.kind === "error" ? "rounded-lg bg-ink px-2 py-1 text-white" : ""}>{msg.text}</span>
          ) : check && !check.ok ? check.error
            : check?.warning ? <span className="rounded-lg bg-white/70 px-2 py-1">{check.warning}</span>
            : existing ? `You logged ${fmtWeight(existing.kg, units)} on this day. Saving replaces it.` : ""}
        </p>
      </form>

      <div className="min-w-0">
        <h3 className="mb-2">Recent entries</h3>
        {recent.length === 0 ? (
          <p className="text-sm font-semibold">No entries yet. Your first weigh-in starts the chart.</p>
        ) : (
          <ul className="grid gap-1.5">
            <AnimatePresence initial={false}>
              {shown.map((w) => (
                <motion.li key={w.id} layout={!reduce} initial={reduce ? false : { opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  className="flex min-w-0 flex-wrap items-center gap-2 rounded-2xl bg-white/65 py-1 pl-3 pr-1">
                  <span className="min-w-0 flex-1 text-sm font-semibold">{w.day === today ? "Today" : shortDate(w.day, { weekday: "short", month: "short", day: "numeric" })}</span>
                  <b className="font-display text-lg tabular-nums">{fmtWeight(w.kg, units)}</b>
                  {confirmDel === w.id ? (
                    <span className="flex gap-1">
                      <button type="button" className="btn !min-h-11 !px-4 text-sm" disabled={busy} onClick={() => remove(w)}>Delete</button>
                      <button type="button" className="btn secondary !min-h-11 !px-4 text-sm" onClick={() => setConfirmDel(null)}>Keep</button>
                    </span>
                  ) : (
                    <span className="flex gap-1">
                      <button type="button" className="btn ghost !min-h-11 !px-3 text-sm" aria-label={`Edit entry for ${w.day}`} onClick={() => { setDay(w.day); document.getElementById(`${uid}-w`)?.focus(); }}>Edit</button>
                      <button type="button" className="btn ghost !min-h-11 !px-3 text-sm" aria-label={`Delete entry for ${w.day}`} onClick={() => setConfirmDel(w.id)}>Delete</button>
                    </span>
                  )}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
        {recent.length > 5 && (
          <button type="button" className="btn ghost mt-1 !px-0" aria-expanded={showAll} onClick={() => setShowAll((s) => !s)}>{showAll ? "Show fewer" : `Show all ${Math.min(recent.length, 60)}`}</button>
        )}
      </div>
    </div>
  );
}
