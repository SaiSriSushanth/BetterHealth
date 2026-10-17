"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/components/AppProvider";
import { CountUp, Reveal, burst, useReducedMotion } from "@/components/fx";
import { estimateFromTable, scale, ZERO, type EstimatedItem } from "@/lib/nutrition/estimate";
import { totalsFor, lastDays } from "@/lib/day";
import type { Meal, Nutrients } from "@/lib/types";

const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];
const guessMeal = (): Meal => { const h = new Date().getHours(); return h < 11 ? "breakfast" : h < 15 ? "lunch" : h < 18 ? "snack" : "dinner"; };

const MEAL_BLOCK: Record<Meal, string> = {
  breakfast: "block-sun", lunch: "block-teal", dinner: "block-bubble", snack: "block-lime",
};
const EXAMPLES = [
  "2 eggs and a slice of toast",
  "a bowl of dal and rice",
  "banana with peanut butter",
  "chicken burrito, no sour cream",
  "greek yogurt with honey",
];

type Draft = { items: EstimatedItem[]; source: "table" | "ai"; confidence?: string };

function shiftDay(day: string, by: number) {
  const [y, m, d] = day.split("-").map(Number);
  const dt = new Date(y, m - 1, d + by);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

const spring = { type: "spring", stiffness: 380, damping: 26 } as const;

function burstFrom(el: HTMLElement) {
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2);
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

export default function FoodPage() {
  const { ready, today, food, targets, addFood, deleteFood, cloud } = useApp();
  const reduce = useReducedMotion();
  const [q, setQ] = useState("");
  const [meal, setMeal] = useState<Meal>(guessMeal);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [manual, setManual] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const day = view ?? today;

  if (!ready || !today) return <div role="status" aria-label="Loading" className="piece h-64 animate-pulse" />;

  function estimate() {
    setMsg(null);
    if (!q.trim()) { setMsg("Type a food first, like “2 eggs and a slice of toast”."); return; }
    const e = estimateFromTable(q);
    setUnmatched(e.unmatched);
    if (e.items.length) { setDraft({ items: e.items, source: "table" }); setManual(false); }
    else { setDraft(null); setMsg("We don't have that in our food list."); }
  }

  async function askAI() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/food/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: q }) });
      const j = await r.json();
      if (j.items) { setDraft({ items: j.items, source: "ai", confidence: j.confidence }); setUnmatched([]); }
      else setMsg(j.error ?? "AI could not help with that one.");
    } catch { setMsg("Could not reach the AI. Check your connection or add it by hand."); }
    setBusy(false);
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
    for (const it of draft.items) {
      await addFood({ meal, name: it.name, portion: it.portion, grams: it.grams, source: draft.source, ...it.nutrients });
    }
    setDraft(null); setQ(""); setUnmatched([]); setMsg("Added to your diary.");
  }

  const dayFood = food.filter((f) => f.day === day);
  const totals = totalsFor(food, day);
  const draftTotal = draft?.items.reduce((s, i) => s + i.nutrients.kcal, 0) ?? 0;
  const dP = draft?.items.reduce((s, i) => s + i.nutrients.proteinG, 0) ?? 0;
  const dC = draft?.items.reduce((s, i) => s + i.nutrients.carbsG, 0) ?? 0;
  const dF = draft?.items.reduce((s, i) => s + i.nutrients.fatG, 0) ?? 0;
  const macroSum = dP * 4 + dC * 4 + dF * 9 || 1;
  const isToday = day === today;
  const oldest = lastDays(today, 30)[0];

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8">
      <header className="min-w-0">
        <h1 className="text-[clamp(2.6rem,1rem+9vw,6.5rem)] leading-[.88]">What did<br />you eat?</h1>
        <p className="mt-3 max-w-prose text-lg text-ink2">Type it the way you&apos;d say it. We&apos;ll work out calories, protein and the rest.</p>
      </header>

      <Reveal>
        <section className="block block-sun relative min-w-0 overflow-hidden p-5 md:p-8" aria-label="Log food">
          <span aria-hidden className="float pointer-events-none absolute -right-10 -top-10 size-40 rounded-full bg-tangerine md:size-56" />
          <span aria-hidden className="float pointer-events-none absolute -bottom-12 left-1/3 size-28 rounded-full bg-bubble" style={{ animationDelay: "-3s" }} />
          <div className="relative">
            <label className="lbl !text-base" htmlFor="q">Food and portion</label>
            <div className="flex min-w-0 flex-col gap-3 md:flex-row">
              <div className="relative min-w-0 flex-1">
                <input id="q" className="field !min-h-[76px] !rounded-[24px] !text-2xl font-semibold md:!text-3xl" value={q} maxLength={200}
                  onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && estimate()} />
                <RotatingPlaceholder show={!q} />
              </div>
              <motion.button className="btn hot !min-h-[76px] !px-8 !text-xl" onClick={estimate} whileTap={reduce ? undefined : { scale: 0.94 }}>Work it out</motion.button>
            </div>
            <div className="hscroll mt-5 pb-1" role="group" aria-label="Meal">
              {MEALS.map((m) => (
                <motion.button key={m} aria-pressed={meal === m} className="chip !min-h-[48px] !px-5 !text-base" onClick={() => setMeal(m)}
                  whileTap={reduce ? undefined : { scale: 0.88 }} transition={spring}>{m}</motion.button>
              ))}
            </div>
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
        </section>
      </Reveal>

      <AnimatePresence initial={false}>
        {manual && (
          <motion.div key="manual" initial={reduce ? false : { opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -12 }} transition={spring}>
            <ManualEntry initialName={q} onAdd={async (n, name, el) => { await addFood({ meal, name, portion: "1 serving", grams: 0, source: "manual", ...n }); burstFrom(el); setManual(false); setQ(""); setMsg("Added to your diary."); }} />
          </motion.div>
        )}
        {draft && (
          <motion.section key="draft" aria-label="Estimate" className="block block-teal mesh min-w-0 p-5 md:p-8"
            initial={reduce ? false : { opacity: 0, y: 40, scale: 0.94, rotate: -1 }} animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.95 }} transition={spring}>
            <div className="relative z-10">
              <h2 className="sr-only">Estimate</h2>
              <p className="display text-[clamp(4.5rem,2rem+16vw,10rem)] leading-[.85] tracking-tighter">
                <CountUp value={draftTotal} duration={0.9} /> <span className="text-[.28em] tracking-tight">kcal</span>
              </p>
              <p className="mt-2 text-lg font-bold">approximately</p>
              <p className="mt-1 max-w-prose font-medium">{draft.source === "ai" ? `Estimated by AI${draft.confidence ? ` (${draft.confidence} confidence)` : ""}. Edit the grams if it looks off.` : "From our food list. Edit the grams to match your portion."}</p>

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
                    <label className="flex items-center gap-2 text-sm font-bold">Grams
                      <input aria-label={`Grams of ${it.name}`} className="field !w-28 !text-xl" inputMode="numeric" value={it.grams} onChange={(e) => setGrams(i, Math.max(1, Math.min(5000, Number(e.target.value) || 1)))} />
                    </label>
                  </motion.li>
                ))}
              </ul>
              <div className="mt-6 flex flex-wrap gap-3">
                <motion.button className="btn !min-h-[60px] !px-8 !text-lg" whileTap={reduce ? undefined : { scale: 0.93 }}
                  onClick={(e) => { burstFrom(e.currentTarget); void save(); }}>Add to {meal}</motion.button>
                <button className="btn secondary" onClick={() => setDraft(null)}>Discard</button>
              </div>
            </div>
          </motion.section>
        )}
      </AnimatePresence>

      <section aria-label="Diary" className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[clamp(2rem,1.2rem+3vw,3.25rem)]">{isToday ? "Today" : day}</h2>
          <div className="flex gap-2">
            <button className="chip" disabled={day <= oldest} onClick={() => setView(shiftDay(day, -1))}>Earlier</button>
            <button className="chip" disabled={isToday} onClick={() => setView(day >= shiftDay(today, -1) ? null : shiftDay(day, 1))}>Later</button>
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
                <p className="mt-1 text-ink2">{isToday ? "An empty plate is a fine place to start. Type your first meal above." : "Use Earlier and Later to look at another day."}</p>
              </div>
            </div>
          </Reveal>
        ) : (
          <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
            <AnimatePresence initial={false}>
              {MEALS.map((m) => {
                const rows = dayFood.filter((f) => f.meal === m);
                if (!rows.length) return null;
                return (
                  <motion.div key={m} layout={!reduce} initial={reduce ? false : { opacity: 0, scale: 0.92, y: 24 }} animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92 }} transition={spring} className={`block ${MEAL_BLOCK[m]} min-w-0 p-5`}>
                    <h3 className="flex items-baseline justify-between gap-3 text-2xl"><span className="capitalize">{m}</span> <span className="font-body text-base font-bold">{Math.round(rows.reduce((s, r) => s + r.kcal, 0))} kcal</span></h3>
                    <ul className="mt-3 grid gap-2">
                      <AnimatePresence initial={false} mode="popLayout">
                        {rows.map((r) => (
                          <motion.li key={r.id} layout={!reduce} initial={reduce ? false : { opacity: 0, x: -30, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, x: 60, scale: 0.85 }} transition={spring}
                            className="flex min-w-0 items-center justify-between gap-3 rounded-2xl bg-white p-3">
                            <div className="min-w-0"><b className="break-words">{r.name}</b><div className="text-sm text-ink2">{r.portion} · {r.kcal} kcal · P {r.proteinG} · C {r.carbsG} · F {r.fatG}</div></div>
                            <button className="btn secondary !min-h-11 !px-4 text-sm" onClick={() => deleteFood(r.id)} aria-label={`Remove ${r.name}`}>Remove</button>
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </ul>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
        <NutrientPanel totals={totals} targets={targets} />
      </section>
    </div>
  );
}

function ManualEntry({ initialName, onAdd }: { initialName: string; onAdd: (n: Nutrients, name: string, el: HTMLElement) => Promise<void> }) {
  const [name, setName] = useState(initialName);
  const [v, setV] = useState({ kcal: "", p: "", c: "", f: "" });
  const num = (s: string) => Math.max(0, Number(s) || 0);
  return (
    <section className="block block-bubble min-w-0 p-5 md:p-8" aria-label="Enter by hand">
      <h2 className="text-3xl">Enter it by hand</h2>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-5">
        <div className="col-span-2 min-w-0 md:col-span-1"><label className="lbl" htmlFor="mn">Name</label><input id="mn" className="field" value={name} onChange={(e) => setName(e.target.value)} /></div>
        {([["kcal", "Calories"], ["p", "Protein g"], ["c", "Carbs g"], ["f", "Fat g"]] as const).map(([k, l]) => (
          <div key={k} className="min-w-0"><label className="lbl" htmlFor={`m${k}`}>{l}</label><input id={`m${k}`} className="field" inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} /></div>
        ))}
      </div>
      <div className="mt-5"><button className="btn" disabled={!name.trim() || !v.kcal}
        onClick={(e) => onAdd({ ...ZERO, kcal: num(v.kcal), proteinG: num(v.p), carbsG: num(v.c), fatG: num(v.f) }, name.trim(), e.currentTarget)}>Add to diary</button></div>
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
