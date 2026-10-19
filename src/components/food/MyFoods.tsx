"use client";
import { useId, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/components/AppProvider";
import { useReducedMotion } from "@/components/fx";
import { customToLog, portionOf, sortMyFoods } from "@/lib/foods";
import type { CustomFood, FoodLog, Meal } from "@/lib/types";
import { CustomFoodForm } from "./CustomFoodForm";
import { Macros, StarButton, spring } from "./shared";

type LogEntry = Omit<FoodLog, "id" | "day">;
const MULTIPLIERS = [0.5, 1, 1.5, 2];

export function MyFoods({ meal, target = meal, onLog, onMessage }: {
  meal: Meal;
  /** where adds go, e.g. "lunch" or "lunch, yesterday" */
  target?: string;
  onLog: (entry: LogEntry, el: HTMLElement) => Promise<void>;
  onMessage: (m: string) => void;
}) {
  const { customFoods, addCustomFood, updateCustomFood, deleteCustomFood } = useApp();
  const reduce = useReducedMotion();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const list = useMemo(() => sortMyFoods(customFoods, q), [customFoods, q]);
  const sid = useId();

  async function toggleFav(cf: CustomFood) {
    try { await updateCustomFood(cf.id, { favorite: !cf.favorite }); }
    catch { onMessage("Could not update that. Try again."); }
  }
  async function remove(cf: CustomFood) {
    try { await deleteCustomFood(cf.id); setConfirm(null); onMessage(`Deleted ${cf.name} from My foods.`); }
    catch { onMessage("Could not delete that. Try again."); }
  }

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label className="lbl !text-base" htmlFor={`${sid}-q`}>Search my foods</label>
          <input id={`${sid}-q`} type="search" className="field" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or ingredient" maxLength={60} />
        </div>
        {!creating && <button className="btn secondary" onClick={() => { setCreating(true); setEditing(null); }}>Create a food</button>}
      </div>

      <AnimatePresence initial={false}>
        {creating && (
          <motion.div key="create" initial={reduce ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={spring}>
            <CustomFoodForm title="Create a food" onCancel={() => setCreating(false)}
              onSave={async (f) => { await addCustomFood(f); setCreating(false); onMessage(`Saved ${f.name} to My foods.`); }} />
          </motion.div>
        )}
      </AnimatePresence>

      {list.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-ink bg-white/80 p-5">
          <p className="font-display text-xl font-extrabold">{customFoods.length ? "Nothing matches that." : "Nothing saved yet."}</p>
          <p className="mt-1 text-ink2">{customFoods.length ? "Try another word, or clear the search." : "Save an estimate or a whole meal from your diary, or create a food by hand. Then log it again in one tap."}</p>
        </div>
      ) : (
        <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2" aria-label="My foods">
          <AnimatePresence initial={false}>
            {list.map((cf) => (
              <motion.li key={cf.id} initial={reduce ? false : { opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }} transition={spring}
                className={`min-w-0 ${open === cf.id || editing === cf.id ? "md:col-span-2" : ""}`}>
                {editing === cf.id ? (
                  <CustomFoodForm initial={cf} title={`Edit ${cf.kind === "meal" ? "meal" : "food"}`} onCancel={() => setEditing(null)}
                    onSave={async (f) => { await updateCustomFood(cf.id, f); setEditing(null); onMessage(`Saved changes to ${f.name}.`); }} />
                ) : (
                  <FoodCard cf={cf} meal={meal} target={target} open={open === cf.id} confirming={confirm === cf.id}
                    onPick={() => { setOpen(open === cf.id ? null : cf.id); setConfirm(null); }}
                    onFav={() => toggleFav(cf)} onEdit={() => { setEditing(cf.id); setOpen(null); setConfirm(null); setCreating(false); }}
                    onAskDelete={() => setConfirm(cf.id)} onCancelDelete={() => setConfirm(null)} onDelete={() => remove(cf)}
                    onLog={async (entry, el) => { await onLog(entry, el); setOpen(null); }} />
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </div>
  );
}

function FoodCard({ cf, meal, target, open, confirming, onPick, onFav, onEdit, onAskDelete, onCancelDelete, onDelete, onLog }: {
  cf: CustomFood; meal: Meal; target: string; open: boolean; confirming: boolean;
  onPick: () => void; onFav: () => void; onEdit: () => void; onAskDelete: () => void; onCancelDelete: () => void; onDelete: () => void;
  onLog: (entry: LogEntry, el: HTMLElement) => Promise<void>;
}) {
  const reduce = useReducedMotion();
  const pid = useId();
  return (
    <div className={`min-w-0 rounded-3xl border-2 border-ink bg-white p-3 transition-shadow ${open ? "shadow-[6px_6px_0_var(--ink)]" : ""}`}>
      <div className="flex min-w-0 items-start gap-2">
        <StarButton on={cf.favorite} name={cf.name} onToggle={onFav} />
        <button type="button" onClick={onPick} aria-expanded={open} aria-controls={pid}
          className="min-h-11 min-w-0 flex-1 rounded-2xl px-2 py-1 text-left hover:bg-sun/40 motion-safe:transition-colors">
          <span className="flex min-w-0 items-baseline justify-between gap-2">
            <b className="min-w-0 break-words text-lg leading-tight">{cf.name}</b>
            <span className="shrink-0 font-display text-xl font-extrabold">{Math.round(cf.nutrients.kcal)}<span className="ml-0.5 font-body text-sm font-bold">kcal</span></span>
          </span>
          <span className="mt-0.5 block text-sm text-ink2">
            {cf.kind === "meal" && <span className="mr-1.5 rounded-full bg-lime px-2 py-0.5 text-xs font-extrabold text-ink">Meal</span>}
            {cf.kind === "meal" ? `${cf.items?.length ?? 0} foods` : cf.portion}{cf.grams > 0 && cf.kind === "food" && !/\bg$/.test(cf.portion) ? ` · ${cf.grams} g` : ""} · <Macros n={cf.nutrients} />
          </span>
        </button>
      </div>

      <div id={pid}>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div key="pick" initial={reduce ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              transition={{ duration: reduce ? 0 : 0.22 }} className="overflow-hidden">
              <PickPortion cf={cf} meal={meal} target={target} onLog={onLog} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {confirming ? (
        <div role="group" aria-label={`Delete ${cf.name}?`} className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl bg-bubble p-2">
          <span className="px-1 font-bold">Delete {cf.name}?</span>
          <button className="btn !min-h-11 !px-4 text-sm" onClick={onDelete} autoFocus>Delete</button>
          <button className="btn secondary !min-h-11 !px-4 text-sm" onClick={onCancelDelete}>Keep</button>
        </div>
      ) : (
        <div className="-mb-1 flex gap-1 pl-12">
          <button className="btn ghost !min-h-11 !px-3 text-sm" onClick={onEdit} aria-label={`Edit ${cf.name}`}>Edit</button>
          <button className="btn ghost !min-h-11 !px-3 text-sm" onClick={onAskDelete} aria-label={`Delete ${cf.name}`}>Delete</button>
        </div>
      )}
    </div>
  );
}

function PickPortion({ cf, meal, target, onLog }: { cf: CustomFood; meal: Meal; target: string; onLog: (entry: LogEntry, el: HTMLElement) => Promise<void> }) {
  const id = useId();
  const [factor, setFactor] = useState(1);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const byGrams = cf.grams > 0;
  const customN = Number(custom.replace(",", "."));
  const customOk = custom.trim() !== "" && Number.isFinite(customN) && customN > 0 && customN <= (byGrams ? 5000 : 20);
  const by = customOk ? (byGrams ? { grams: customN } : { factor: customN }) : { factor };
  const p = portionOf(cf, by);
  const bad = custom.trim() !== "" && !customOk;

  return (
    <div className="mt-3 grid min-w-0 gap-3 rounded-2xl bg-bg p-3">
      <div role="group" aria-label="Portion" className="grid max-w-xs grid-cols-4 gap-1.5">
        {MULTIPLIERS.map((m) => (
          <button key={m} type="button" className="chip !min-h-11 justify-center !px-1 !normal-case" aria-pressed={!customOk && factor === m}
            onClick={() => { setFactor(m); setCustom(""); }}>{m}x</button>
        ))}
      </div>
      <div className="flex min-w-0 flex-wrap items-end gap-3">
        <div className="w-36 min-w-0">
          <label className="lbl" htmlFor={`${id}-c`}>{byGrams ? "Or grams" : "Or servings"}</label>
          <input id={`${id}-c`} className="field" inputMode="decimal" value={custom} maxLength={6}
            placeholder={byGrams ? String(cf.grams) : "1"} onChange={(e) => setCustom(e.target.value)}
            aria-invalid={bad || undefined} aria-describedby={bad ? `${id}-e` : undefined} />
        </div>
        <p className="min-w-0 pb-3 text-sm font-semibold" aria-live="polite">
          {p.portion} · {p.nutrients.kcal} kcal · <Macros n={p.nutrients} />
        </p>
      </div>
      {bad && <p id={`${id}-e`} className="-mt-1 text-sm font-bold text-[#a3260b]">{byGrams ? "Use 1 to 5000 grams." : "Use a number from 0.1 to 20."}</p>}
      <div>
        <button className="btn hot" disabled={busy || bad} onClick={async (e) => {
          const el = e.currentTarget;
          setBusy(true);
          try { await onLog(customToLog(cf, by, meal), el); } finally { setBusy(false); }
        }}>{busy ? "Adding…" : `Add to ${target}`}</button>
      </div>
    </div>
  );
}
