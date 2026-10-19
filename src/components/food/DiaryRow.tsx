"use client";
import { useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/components/fx";
import { rescaleLog } from "@/lib/foods";
import type { FoodLog, Meal } from "@/lib/types";
import { MEALS, Macros } from "./shared";

type Patch = Partial<Omit<FoodLog, "id" | "day">>;

/** A diary entry you can re-file to another meal, resize (nutrients scale with it) or remove. */
export function DiaryRow({ row, onUpdate, onRemove }: {
  row: FoodLog;
  onUpdate: (id: string, patch: Patch) => Promise<void>;
  onRemove: (row: FoodLog) => void;
}) {
  const [editing, setEditing] = useState(false);
  const reduce = useReducedMotion();
  return (
    <div className="min-w-0 rounded-2xl bg-white p-3">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-[1_1_12rem]">
          <b className="break-words">{row.name}</b>
          <div className="text-sm text-ink2">{row.portion} · {Math.round(row.kcal)} kcal · <Macros n={row} /></div>
        </div>
        <div className="flex shrink-0 gap-2">
          <button className="btn secondary !min-h-11 !px-4 text-sm" aria-expanded={editing} onClick={() => setEditing((e) => !e)}
            aria-label={`${editing ? "Close editing" : "Edit"} ${row.name}`}>{editing ? "Close" : "Edit"}</button>
          <button className="btn secondary !min-h-11 !px-4 text-sm" onClick={() => onRemove(row)} aria-label={`Remove ${row.name}`}>Remove</button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {editing && (
          <motion.div key="edit" initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.2 }} className="overflow-hidden">
            <RowEditor row={row} onDone={() => setEditing(false)} onUpdate={onUpdate} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function RowEditor({ row, onUpdate, onDone }: { row: FoodLog; onUpdate: (id: string, patch: Patch) => Promise<void>; onDone: () => void }) {
  const id = useId();
  const byGrams = row.grams > 0;
  const [meal, setMeal] = useState<Meal>(row.meal);
  const [amount, setAmount] = useState(byGrams ? String(row.grams) : "1");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const n = Number(amount.replace(",", "."));
  const valid = Number.isFinite(n) && n > 0 && n <= (byGrams ? 5000 : 20);
  const factor = valid ? (byGrams ? n / row.grams : n) : 1;
  const preview = rescaleLog(row, factor, byGrams && valid ? { grams: n } : {});
  const sizeChanged = valid && Math.abs(factor - 1) > 1e-9;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) { setErr(byGrams ? "Use 1 to 5000 grams." : "Use a number from 0.1 to 20."); return; }
    const patch: Patch = { ...(meal !== row.meal ? { meal } : {}), ...(sizeChanged ? preview : {}) };
    if (!Object.keys(patch).length) { onDone(); return; }
    setBusy(true); setErr(null);
    try { await onUpdate(row.id, patch); onDone(); }
    catch { setErr("Could not save that. Try again."); }
    setBusy(false);
  }

  return (
    <form onSubmit={save} noValidate className="mt-3 grid min-w-0 gap-3 border-t-2 border-dashed border-ink/30 pt-3">
      <div className="grid min-w-0 grid-cols-2 gap-3">
        <div className="min-w-0">
          <label className="lbl" htmlFor={`${id}-m`}>Meal</label>
          <select id={`${id}-m`} className="field capitalize" value={meal} onChange={(e) => setMeal(e.target.value as Meal)}>
            {MEALS.map((m) => <option key={m} value={m}>{m[0].toUpperCase() + m.slice(1)}</option>)}
          </select>
        </div>
        <div className="min-w-0">
          <label className="lbl" htmlFor={`${id}-a`}>{byGrams ? "Grams" : "Times this portion"}</label>
          <input id={`${id}-a`} className="field" inputMode="decimal" value={amount} maxLength={6} onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!valid || undefined} aria-describedby={err ? `${id}-e` : undefined} />
        </div>
      </div>
      <p className="text-sm font-semibold" aria-live="polite">
        {valid ? <>{preview.portion} · {preview.kcal} kcal · <Macros n={preview} /></> : "Enter an amount to see the new numbers."}
      </p>
      {err && <p id={`${id}-e`} role="alert" className="text-sm font-bold text-[#a3260b]">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn !min-h-11 !px-5 text-sm" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        <button type="button" className="btn secondary !min-h-11 !px-5 text-sm" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}
