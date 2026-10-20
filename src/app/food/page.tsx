"use client";
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/components/AppProvider";
import { CountUp, Reveal, useReducedMotion } from "@/components/fx";
import { FoodCapture, type CaptureResult } from "@/components/FoodCapture";
import { CustomFoodForm } from "@/components/food/CustomFoodForm";
import { DiaryRow } from "@/components/food/DiaryRow";
import { MyFoods } from "@/components/food/MyFoods";
import { Recents } from "@/components/food/Recents";
import { SaveToMyFoods } from "@/components/food/SaveToMyFoods";
import { UndoToast, type Toast } from "@/components/food/UndoToast";
import { MEALS, MEAL_BLOCK, burstFrom, spring } from "@/components/food/shared";
import { clampLogDay, dayLabel, itemsToCustomFood, logsToItems, oldestLogDay, relog, shiftDay } from "@/lib/foods";
import { estimateFromTable, scale, ZERO, type EstimatedItem } from "@/lib/nutrition/estimate";
import { totalsFor } from "@/lib/day";
import type { FoodLog, Meal, Nutrients } from "@/lib/types";

const guessMeal = (): Meal => { const h = new Date().getHours(); return h < 11 ? "breakfast" : h < 15 ? "lunch" : h < 18 ? "snack" : "dinner"; };

const EXAMPLES = [
  "2 eggs and a slice of toast",
  "a bowl of dal and rice",
  "banana with peanut butter",
  "chicken burrito, no sour cream",
  "greek yogurt with honey",
];

type DraftSource = "table" | "ai" | "barcode" | "photo";
type Draft = { items: EstimatedItem[]; source: DraftSource; confidence?: string };
type Tab = "search" | "mine" | "recent";
type LogEntry = Omit<FoodLog, "id" | "day">;

const TABS: { id: Tab; label: string }[] = [
  { id: "search", label: "Search" },
  { id: "mine", label: "My foods" },
  { id: "recent", label: "Recents" },
];

function draftNote(d: Draft) {
  const conf = d.confidence ? ` (${d.confidence} confidence)` : "";
  switch (d.source) {
    case "ai": return `Estimated by AI${conf}. Edit the grams if it looks off.`;
    case "photo": {
      const refs = new Set(d.items.map((i) => (i as { ref?: { source: string } }).ref?.source).filter(Boolean));
      const grounded = refs.size ? " Nutrients come from food composition data (IFCT or USDA) where we found a match." : "";
      return `Portions estimated from your photo${conf}.${grounded} Edit the grams if it looks off.`;
    }
    case "barcode": return "From the barcode label. Edit the grams to match how much you had.";
    default: return "From our food list. Edit the grams to match your portion.";
  }
}

/** Horizontal meter that grows in. Decorative: the numbers beside it carry the meaning. */
function Meter({ pct, track = "bg-white/60", fill = "bg-ink", delay = 0, h = "h-3" }: { pct: number; track?: string; fill?: string; delay?: number; h?: string }) {
  const reduce = useReducedMotion();
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div aria-hidden className={`${h} w-full overflow-hidden rounded-full ${track}`}>
      <motion.div className={`h-full rounded-full ${fill}`} initial={reduce ? false : { width: 0 }} animate={{ width: `${w}%` }}
        transition={{ type: "spring", stiffness: 90, damping: 18, delay }} />
    </div>
  );
}

function RotatingPlaceholder({ show }: { show: boolean }) {
  const reduce = useReducedMotion();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce || !show) return;
    const t = setInterval(() => setI((n) => (n + 1) % EXAMPLES.length), 2600);
    return () => clearInterval(t);
  }, [reduce, show]);
  if (!show) return null;
  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-5 text-ink/60">
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={i} className="block truncate text-2xl font-semibold md:text-3xl"
          initial={reduce ? false : { y: 26, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { y: -26, opacity: 0 }} transition={{ duration: 0.28 }}>
          {EXAMPLES[i]}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/** Search | My foods | Recents. Arrow keys move between tabs (WAI-ARIA tabs pattern, automatic activation). */
function Tabs({ tab, setTab, counts, idBase }: { tab: Tab; setTab: (t: Tab) => void; counts: Partial<Record<Tab, number>>; idBase: string }) {
  const reduce = useReducedMotion();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKey(e: React.KeyboardEvent, i: number) {
    const n = TABS.length;
    const to = e.key === "ArrowRight" ? (i + 1) % n : e.key === "ArrowLeft" ? (i - 1 + n) % n : e.key === "Home" ? 0 : e.key === "End" ? n - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    setTab(TABS[to].id);
    refs.current[to]?.focus();
  }
  return (
    <div role="tablist" aria-label="How to log" className="grid w-full grid-cols-3 gap-1 rounded-full border-2 border-ink bg-white p-1 sm:w-auto sm:justify-self-start">
      {TABS.map((t, i) => {
        const on = tab === t.id;
        return (
          <button key={t.id} ref={(el) => { refs.current[i] = el; }} role="tab" id={`${idBase}-tab-${t.id}`} aria-selected={on}
            aria-controls={`${idBase}-panel-${t.id}`} tabIndex={on ? 0 : -1} onClick={() => setTab(t.id)} onKeyDown={(e) => onKey(e, i)}
            className={`relative min-h-11 min-w-0 rounded-full px-2 text-sm font-bold sm:px-5 sm:text-base ${on ? "text-white" : "text-ink hover:bg-sun/60"}`}>
            {on && <motion.span layoutId={`${idBase}-pill`} aria-hidden className="absolute inset-0 rounded-full bg-ink" transition={reduce ? { duration: 0 } : spring} />}
            <span className="relative whitespace-nowrap">{t.label}{counts[t.id] ? <span className={`ml-1.5 rounded-full px-1.5 text-xs ${on ? "bg-lime text-ink" : "bg-ink/10"}`}>{counts[t.id]}</span> : null}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function FoodPage() {
  const { ready, today, food, targets, customFoods, addFood, updateFood, deleteFood, addCustomFood, cloud } = useApp();
  const reduce = useReducedMotion();
  const idBase = useId();
  const [tab, setTab] = useState<Tab>("search");
  const [q, setQ] = useState("");
  const [meal, setMeal] = useState<Meal>(guessMeal);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [manual, setManual] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const [savingMeal, setSavingMeal] = useState<Meal | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const day = view ?? today;

  if (!ready || !today) return <div role="status" aria-label="Loading" className="piece h-64 animate-pulse" />;

  const isToday = day === today;
  const oldest = oldestLogDay(today);
  const dayWord = day >= shiftDay(today, -1) ? dayLabel(day, today).toLowerCase() : dayLabel(day, today);
  const where = `${meal}${isToday ? "" : `, ${dayWord}`}`;
  const notify = (text: string, onUndo?: () => void) => setToast({ id: Date.now(), text, onUndo });

  function showDraft(d: Draft) {
    setDraft(d); setSavingDraft(false); setManual(false); setMsg(null);
  }

  function estimate() {
    setMsg(null);
    if (!q.trim()) { setMsg("Type a food first, like “2 eggs and a slice of toast”."); return; }
    const e = estimateFromTable(q);
    setUnmatched(e.unmatched);
    if (e.items.length) showDraft({ items: e.items, source: "table" });
    else { setDraft(null); setMsg("We don't have that in our food list."); }
  }

  async function askAI() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/food/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
      const j = await r.json();
      if (j.items) { showDraft({ items: j.items, source: "ai", confidence: j.confidence }); setUnmatched([]); }
      else setMsg(j.error ?? "AI could not help with that one.");
    } catch { setMsg("Could not reach the AI. Check your connection or add it by hand."); }
    setBusy(false);
  }

  function onCapture(r: CaptureResult) {
    if (!r.items?.length) { setMsg("We couldn't read any food from that. Try again or type it."); return; }
    setUnmatched([]);
    showDraft({ items: r.items, source: r.source, confidence: r.confidence });
  }

  function setGrams(i: number, grams: number) {
    setDraft((d) => {
      if (!d) return d;
      const items = d.items.map((it, idx) => idx !== i || it.grams <= 0 ? it : { ...it, grams, nutrients: scale(it.nutrients, grams / it.grams), portion: `${grams} g` });
      return { ...d, items };
    });
  }

  async function save() {
    if (!draft) return;
    try {
      for (const it of draft.items) {
        await addFood({ meal, name: it.name, portion: it.portion, grams: it.grams, source: draft.source, ...it.nutrients, day });
      }
      setDraft(null); setSavingDraft(false); setQ(""); setUnmatched([]);
      setMsg(isToday ? "Added to your diary." : `Added to ${dayWord}.`);
    } catch { setMsg("Could not add that. Try again."); }
  }

  /** Log from My foods or Recents. */
  async function logEntry(entry: LogEntry, el: HTMLElement) {
    burstFrom(el);
    try {
      await addFood({ ...entry, day });
      notify(`Added ${entry.name} to ${where}.`);
    } catch { notify("Could not add that. Try again."); }
  }

  async function removeRow(row: FoodLog) {
    try {
      await deleteFood(row.id);
      notify(`Removed ${row.name}.`, () => { void addFood({ ...relog(row), day: row.day }).catch(() => notify("Could not bring it back.")); });
    } catch { notify("Could not remove that. Try again."); }
  }

  function pickDay(v: string) {
    if (!v) return;
    const d = clampLogDay(v, today);
    setView(d === today ? null : d);
  }

  const dayFood = food.filter((f) => f.day === day);
  const totals = totalsFor(food, day);
  const draftTotal = draft?.items.reduce((s, i) => s + i.nutrients.kcal, 0) ?? 0;
  const dP = draft?.items.reduce((s, i) => s + i.nutrients.proteinG, 0) ?? 0;
  const dC = draft?.items.reduce((s, i) => s + i.nutrients.carbsG, 0) ?? 0;
  const dF = draft?.items.reduce((s, i) => s + i.nutrients.fatG, 0) ?? 0;
  const macroSum = dP * 4 + dC * 4 + dF * 9 || 1;
  const panel = (t: Tab) => ({ role: "tabpanel", id: `${idBase}-panel-${t}`, "aria-labelledby": `${idBase}-tab-${t}`, hidden: tab !== t } as const);

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      <header className="min-w-0">
        <h1 className="text-[clamp(2.6rem,1rem+9vw,6.5rem)] leading-[.88]">What did<br />you eat?</h1>
        <p className="mt-3 max-w-prose text-lg text-ink2">Type it the way you&apos;d say it, or pick something you&apos;ve had before. We&apos;ll work out calories, protein and the rest.</p>
      </header>

      <Reveal>
        <section className="block block-sun relative min-w-0 overflow-clip p-5 md:p-8" aria-label="Log food">
          <span aria-hidden className="float pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-tangerine md:size-56" />
          <span aria-hidden className="float pointer-events-none absolute -bottom-12 left-1/3 size-28 rounded-full bg-bubble" style={{ animationDelay: "-3s" }} />
          <div className="relative grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
            <Tabs tab={tab} setTab={setTab} idBase={idBase} counts={{ mine: customFoods.length }} />

            <div className="flex min-w-0 flex-wrap items-end gap-x-4 gap-y-3">
              <div className="min-w-0 flex-[1_1_18rem]">
                <span className="mb-[.35rem] block text-[.9rem] font-bold" id={`${idBase}-meal`}>Meal</span>
                <div className="hscroll pb-1" role="group" aria-labelledby={`${idBase}-meal`}>
                  {MEALS.map((m) => (
                    <motion.button key={m} aria-pressed={meal === m} className="chip !min-h-[48px] !px-5 !text-base" onClick={() => setMeal(m)}
                      whileTap={reduce ? undefined : { scale: 0.88 }} transition={spring}>{m}</motion.button>
                  ))}
                </div>
              </div>
              <div className="w-[11.5rem] min-w-0">
                <label className="lbl" htmlFor={`${idBase}-day`}>Day {!isToday && <span className="font-semibold">({dayLabel(day, today)})</span>}</label>
                <input id={`${idBase}-day`} type="date" className="field !min-h-[48px] !py-1" value={day} min={oldest} max={today}
                  onChange={(e) => pickDay(e.target.value)} />
              </div>
            </div>

            <div {...panel("search")} className="min-w-0">
              <label className="lbl !text-base" htmlFor="q">Food and portion</label>
              <div className="flex min-w-0 flex-col gap-3 md:flex-row">
                <div className="relative min-w-0 flex-1">
                  <input id="q" className="field !min-h-[76px] !rounded-[24px] !text-2xl font-semibold md:!text-3xl" value={q} maxLength={200}
                    onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && estimate()} />
                  <RotatingPlaceholder show={!q} />
                </div>
                <motion.button className="btn hot !min-h-[76px] !px-8 !text-xl" onClick={estimate} whileTap={reduce ? undefined : { scale: 0.94 }}>Work it out</motion.button>
              </div>
              <div className="mt-3 empty:hidden"><FoodCapture onResult={onCapture} disabledReason={null} /></div>
              <p role="status" className="mt-4 empty:hidden">{msg && <span className="inline-block rounded-2xl bg-white px-4 py-2 font-bold">{msg}</span>}</p>
              {(unmatched.length > 0 || (msg && !draft)) && (
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {unmatched.length > 0 && <span className="rounded-2xl bg-white px-3 py-1 font-semibold">Not found: {unmatched.join(", ")}.</span>}
                  <button className="btn" disabled={busy} onClick={askAI}>{busy ? "Asking…" : "Ask AI to estimate"}</button>
                  <button className="btn secondary" onClick={() => { setManual(true); setDraft(null); }}>Enter by hand</button>
                </div>
              )}
              {!cloud && (unmatched.length > 0 || msg) && <p className="mt-2 text-sm font-semibold">AI estimates need you to sign in first.</p>}
            </div>

            <div {...panel("mine")} className="min-w-0">
              {tab === "mine" && <MyFoods meal={meal} target={where} onLog={logEntry} onMessage={(m) => notify(m)} />}
            </div>
            <div {...panel("recent")} className="min-w-0">
              {tab === "recent" && <Recents meal={meal} target={where} onLog={logEntry} />}
            </div>
          </div>
        </section>
      </Reveal>

      <AnimatePresence initial={false}>
        {manual && tab === "search" && (
          <motion.div key="manual" initial={reduce ? false : { opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12 }} transition={spring}>
            <ManualEntry initialName={q} meal={meal}
              onAdd={async (n, name, el) => {
                burstFrom(el);
                try {
                  await addFood({ meal, name, portion: "1 serving", grams: 0, source: "manual", ...n, day });
                  setManual(false); setQ(""); setMsg(isToday ? "Added to your diary." : `Added to ${dayWord}.`);
                } catch { setMsg("Could not add that. Try again."); }
              }}
              onSaveFood={async (n, name, favorite) => {
                await addCustomFood({ name, portion: "1 serving", grams: 0, nutrients: n, favorite, kind: "food" });
                notify(`Saved ${name} to My foods.`);
              }}
              onCancel={() => setManual(false)} />
          </motion.div>
        )}
        {draft && tab === "search" && (
          <motion.section key="draft" aria-label="Estimate" className="block block-teal mesh min-w-0 p-5 md:p-8"
            initial={reduce ? false : { opacity: 0, y: 40, scale: 0.94, rotate: -1 }} animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.95 }} transition={spring}>
            <div className="relative z-10">
              <h2 className="sr-only">Estimate</h2>
              <p className="display text-[clamp(4.5rem,2rem+16vw,10rem)] leading-[.85] tracking-tighter">
                <CountUp value={draftTotal} duration={0.9} /> <span className="text-[.28em] tracking-tight">kcal</span>
              </p>
              <p className="mt-2 text-lg font-bold">approximately</p>
              <p className="mt-1 max-w-prose font-medium">{draftNote(draft)}</p>

              <dl className="mt-5 grid grid-cols-3 gap-2 sm:gap-3">
                {([["Protein", dP, dP * 4, "bg-sun"], ["Carbs", dC, dC * 4, "bg-bubble"], ["Fat", dF, dF * 9, "bg-lime"]] as const).map(([l, g, k, c], i) => (
                  <div key={l} className="min-w-0 rounded-3xl bg-white/85 p-3 sm:p-4">
                    <dt className="text-sm font-bold">{l}</dt>
                    <dd className="m-0 mb-2 font-display text-3xl font-extrabold">{Math.round(g)}g</dd>
                    <Meter pct={(k / macroSum) * 100} track="bg-ink/15" fill={c + " border-2 border-ink"} delay={0.1 + i * 0.1} />
                  </div>
                ))}
              </dl>

              <ul className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-3">
                {draft.items.map((it, i) => (
                  <motion.li key={i} initial={reduce ? false : { opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ ...spring, delay: 0.15 + i * 0.07 }}
                    className="grid min-w-0 items-center gap-3 rounded-3xl bg-white p-4 md:grid-cols-[minmax(0,1fr)_auto]">
                    <div className="min-w-0"><b className="break-words text-lg">{it.name}</b><div className="text-sm text-ink2">{it.nutrients.kcal} kcal · P {it.nutrients.proteinG} · C {it.nutrients.carbsG} · F {it.nutrients.fatG}</div></div>
                    {it.grams > 0 && (
                      <label className="flex items-center gap-2 text-sm font-bold">Grams
                        <input aria-label={`Grams of ${it.name}`} className="field !w-28 !text-xl" inputMode="numeric" value={it.grams} onChange={(e) => setGrams(i, Math.max(1, Math.min(5000, Number(e.target.value) || 1)))} />
                      </label>
                    )}
                  </motion.li>
                ))}
              </ul>
              <AnimatePresence initial={false}>
                {savingDraft && (
                  <motion.div key="save" className="mt-5" initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={spring}>
                    <SaveToMyFoods
                      defaultName={draft.items.length === 1 ? draft.items[0].name : (draft.source === "table" || draft.source === "ai") && q.trim() ? q.trim() : draft.items.map((i) => i.name).join(" + ")}
                      hint={draft.items.length > 1 ? `Saves these ${draft.items.length} foods together as one meal, at these portions.` : "Saves this food at this portion."}
                      onCancel={() => setSavingDraft(false)}
                      onSave={async (name, fav) => {
                        await addCustomFood(itemsToCustomFood(draft.items, name, fav));
                        setSavingDraft(false);
                        notify(`Saved ${name} to My foods.`);
                      }} />
                  </motion.div>
                )}
              </AnimatePresence>
              <div className="mt-6 flex flex-wrap gap-3">
                <motion.button className="btn !min-h-[60px] !px-8 !text-lg" whileTap={reduce ? undefined : { scale: 0.93 }}
                  onClick={(e) => { burstFrom(e.currentTarget); void save(); }}>Add to {where}</motion.button>
                {!savingDraft && <button className="btn secondary" onClick={() => setSavingDraft(true)}>Save to My foods</button>}
                <button className="btn ghost" onClick={() => { setDraft(null); setSavingDraft(false); }}>Discard</button>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <section aria-label="Diary" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[clamp(2rem,1.2rem+3vw,3.25rem)]">{dayLabel(day, today)}</h2>
          <div className="flex gap-2">
            <button className="chip !min-h-11" disabled={day <= oldest} onClick={() => setView(shiftDay(day, -1))}>Earlier</button>
            <button className="chip !min-h-11" disabled={isToday} onClick={() => setView(day >= shiftDay(today, -1) ? null : shiftDay(day, 1))}>Later</button>
          </div>
        </div>
        {dayFood.length === 0 ? (
          <Reveal>
            <div className="relative grid min-w-0 items-center gap-4 overflow-hidden rounded-[32px] border-2 border-dashed border-ink bg-white p-6 sm:grid-cols-[auto_minmax(0,1fr)]">
              <svg aria-hidden viewBox="0 0 120 120" className="float size-24">
                <circle cx="60" cy="60" r="52" fill="#ffd23f" stroke="#0b1f1d" strokeWidth="4" />
                <circle cx="60" cy="60" r="32" fill="#fff" stroke="#0b1f1d" strokeWidth="4" />
                <path d="M96 14v34M90 14v14a6 6 0 0 0 12 0V14" stroke="#0b1f1d" strokeWidth="4" strokeLinecap="round" fill="none" />
              </svg>
              <div className="min-w-0">
                <p className="font-display text-2xl font-extrabold">Nothing logged {isToday ? "yet" : "this day"}.</p>
                <p className="mt-1 text-ink2">{isToday ? "An empty plate is a fine place to start. Type your first meal above." : "Log to this day from above, or use Earlier and Later to look at another day."}</p>
              </div>
            </div>
          </Reveal>
        ) : (
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
            <AnimatePresence initial={false}>
              {MEALS.map((m) => {
                const rows = dayFood.filter((f) => f.meal === m);
                if (!rows.length) return null;
                const asMeal = rows.length > 1;
                return (
                  <motion.div key={m} layout={!reduce} initial={reduce ? false : { opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92 }} transition={spring} className={`block ${MEAL_BLOCK[m]} min-w-0 p-4 sm:p-5`}>
                    <h3 className="flex items-baseline justify-between gap-3 text-2xl"><span className="capitalize">{m}</span> <span className="font-body text-base font-bold">{Math.round(rows.reduce((s, r) => s + r.kcal, 0))} kcal</span></h3>
                    <ul className="mt-3 grid gap-2">
                      <AnimatePresence initial={false} mode="popLayout">
                        {rows.map((r) => (
                          <motion.li key={r.id} layout={!reduce} initial={reduce ? false : { opacity: 0, x: -30, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 60, scale: 0.85 }} transition={spring} className="min-w-0">
                            <DiaryRow row={r} onUpdate={updateFood} onRemove={removeRow} />
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </ul>
                    {savingMeal === m ? (
                      <div className="mt-3">
                        <SaveToMyFoods label={asMeal ? "Save as a meal" : "Save to My foods"}
                          defaultName={asMeal ? `My ${m}` : rows[0].name}
                          hint={asMeal ? `Saves all ${rows.length} foods as one meal you can log in one tap.` : undefined}
                          onCancel={() => setSavingMeal(null)}
                          onSave={async (name, fav) => {
                            await addCustomFood(itemsToCustomFood(logsToItems(rows), name, fav));
                            setSavingMeal(null);
                            notify(`Saved ${name} to My foods.`);
                          }} />
                      </div>
                    ) : (
                      <button className="btn ghost mt-1 !min-h-11 !px-2 text-sm" onClick={() => setSavingMeal(m)}>
                        {asMeal ? "Save as a meal" : "Save to My foods"}
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
        <NutrientPanel totals={totals} targets={targets} />
      </section>

      <UndoToast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function ManualEntry({ initialName, meal, onAdd, onSaveFood, onCancel }: {
  initialName: string;
  meal: Meal;
  onAdd: (n: Nutrients, name: string, el: HTMLElement) => Promise<void>;
  onSaveFood: (n: Nutrients, name: string, favorite: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [v, setV] = useState({ kcal: "", p: "", c: "", f: "" });
  const [full, setFull] = useState(false);
  const num = (s: string) => Math.max(0, Number(s) || 0);
  const n: Nutrients = { ...ZERO, kcal: Math.min(5000, num(v.kcal)), proteinG: num(v.p), carbsG: num(v.c), fatG: num(v.f) };
  if (full) {
    return (
      <section className="block block-bubble min-w-0 p-5 md:p-8" aria-label="Create a food">
        <CustomFoodForm title="Save to My foods" onCancel={() => setFull(false)}
          initial={{ id: "", name: name.trim(), portion: "1 serving", grams: 0, nutrients: n, favorite: false, kind: "food" }}
          onSave={async (f) => { await onSaveFood(f.nutrients, f.name, f.favorite); setFull(false); }} />
      </section>
    );
  }
  return (
    <section className="block block-bubble min-w-0 p-5 md:p-8" aria-label="Enter by hand">
      <h2 className="text-3xl">Enter it by hand</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="col-span-2 min-w-0 md:col-span-1"><label className="lbl" htmlFor="mn">Name</label><input id="mn" className="field" value={name} onChange={(e) => setName(e.target.value)} /></div>
        {([["kcal", "Calories"], ["p", "Protein g"], ["c", "Carbs g"], ["f", "Fat g"]] as const).map(([k, l]) => (
          <div key={k} className="min-w-0"><label className="lbl" htmlFor={`m${k}`}>{l}</label><input id={`m${k}`} className="field" inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-3">
        <button className="btn" disabled={!name.trim() || !v.kcal}
          onClick={(e) => onAdd(n, name.trim(), e.currentTarget)}>Add to {meal}</button>
        <button className="btn secondary" disabled={!name.trim()} onClick={() => setFull(true)}>Save to My foods</button>
        <button className="btn ghost" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}

function NutrientPanel({ totals, targets }: { totals: Nutrients; targets: import("@/lib/types").Targets | null }) {
  const reduce = useReducedMotion();
  const big: { l: string; v: number; u: string; t?: number; cls: string }[] = [
    { l: "Calories", v: totals.kcal, u: "kcal", t: targets?.kcal, cls: "block-tangerine col-span-2" },
    { l: "Protein", v: totals.proteinG, u: "g", t: targets?.proteinG, cls: "block-teal" },
    { l: "Carbs", v: totals.carbsG, u: "g", t: targets?.carbsG, cls: "block-sun" },
    { l: "Fat", v: totals.fatG, u: "g", t: targets?.fatG, cls: "block-bubble" },
    { l: "Fiber", v: totals.fiberG, u: "g", t: targets?.fiberG, cls: "block-lime" },
  ];
  const small: [string, number, string, number?][] = [
    ["Sugar", totals.sugarG, "g"],
    ["Sodium", totals.sodiumMg, "mg", 2300], ["Potassium", totals.potassiumMg, "mg", 3400],
    ["Calcium", totals.calciumMg, "mg", 1000], ["Iron", totals.ironMg, "mg", 18], ["Vitamin C", totals.vitCMg, "mg", 90],
  ];
  return (
    <div className="min-w-0">
      <h3 className="mb-3 text-3xl">Everything you took in</h3>
      <dl className="grid min-w-0 grid-cols-2 gap-3 lg:grid-cols-4">
        {big.map((b, i) => (
          <motion.div key={b.l} initial={reduce ? false : { opacity: 0, scale: 0.8, rotate: -3 }} whileInView={{ opacity: 1, scale: 1, rotate: 0 }}
            viewport={{ once: true, margin: "-5% 0px" }} transition={{ type: "spring", stiffness: 260, damping: 18, delay: i * 0.06 }}
            className={`block ${b.cls} min-w-0 p-4 sm:p-5`}>
            <dt className="font-bold">{b.l}</dt>
            <dd className="m-0">
              <span className="display block text-5xl">{Math.round(b.v)}<span className="ml-1 font-body text-base font-bold">{b.u}</span></span>
              {b.t ? <span className="mb-2 block text-sm font-semibold">of {b.t}</span> : <span className="mb-2 block text-sm font-semibold">no set target</span>}
              {b.t ? <Meter pct={(b.v / b.t) * 100} track="bg-ink/15" h="h-4" delay={0.15 + i * 0.06} /> : null}
            </dd>
          </motion.div>
        ))}
        {small.map(([l, v, u, t], i) => (
          <motion.div key={l} initial={reduce ? false : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-5% 0px" }}
            transition={{ type: "spring", stiffness: 200, damping: 20, delay: i * 0.05 }} className="card min-w-0 p-4">
            <dt className="text-sm font-bold">{l}</dt>
            <dd className="m-0">
              <span className="display block text-3xl">{Math.round(v)}<span className="ml-1 font-body text-sm font-bold">{u}</span></span>
              {t ? <span className="mb-2 block text-sm text-muted">of {t}</span> : <span className="mb-2 block text-sm text-muted">no set target</span>}
              {t ? <Meter pct={(v / t) * 100} track="bg-line" fill="bg-teal" delay={0.1} /> : null}
            </dd>
          </motion.div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-ink2">Micronutrient goals are typical adult daily values. Sodium is a limit, not a target.</p>
    </div>
  );
}
