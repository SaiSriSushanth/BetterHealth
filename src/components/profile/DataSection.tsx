"use client";
import { useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/components/fx";
import type { CustomFood, FoodLog, Profile, Targets, WeightLog, WorkoutLog } from "@/lib/types";
import { buildFoodCsv, buildJsonExport, downloadText } from "./exportData";

interface Props {
  profile: Profile | null; targets: Targets | null;
  food: FoodLog[]; workouts: WorkoutLog[]; weights: WeightLog[]; customFoods: CustomFood[];
  cloud: boolean;
  onDelete: () => Promise<void>;
}

const stamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const word = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);

export function DataSection(p: Props) {
  const reduce = useReducedMotion();
  const [stage, setStage] = useState<"idle" | "confirm">("idle");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputId = useId();
  const where = p.cloud ? "your account" : "this device";
  const empty = !p.profile && !p.food.length && !p.workouts.length && !p.weights.length && !p.customFoods.length;

  function exportJson() {
    downloadText(`betterhealth-${stamp()}.json`, buildJsonExport({ ...p, storedIn: p.cloud ? "account" : "device" }), "application/json");
  }
  function exportCsv() {
    downloadText(`betterhealth-food-diary-${stamp()}.csv`, buildFoodCsv(p.food), "text/csv;charset=utf-8");
  }
  async function del() {
    if (typed.trim() !== "DELETE") return;
    setBusy(true); setErr(null);
    try { await p.onDelete(); setStage("idle"); setTyped(""); }
    catch (e) { setErr(e instanceof Error ? e.message : "Could not delete everything. Try again."); }
    finally { setBusy(false); }
  }

  const stats = [
    { n: p.food.length, l: word(p.food.length, "food entry", "food entries") },
    { n: p.workouts.length, l: word(p.workouts.length, "workout") },
    { n: p.weights.length, l: word(p.weights.length, "weigh-in") },
    { n: p.customFoods.length, l: word(p.customFoods.length, "saved food") },
  ];

  return (
    <section aria-labelledby="data-h" className="card grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 p-5 md:p-8">
      <div>
        <h2 id="data-h" className="text-[clamp(1.9rem,1.2rem+2.5vw,3rem)]">Your data</h2>
        <p className="mt-2 max-w-prose text-ink2">It&apos;s yours. Take a copy any time, or wipe it from {where}.</p>
      </div>

      <ul className="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <li key={s.l} className="min-w-0 rounded-[22px] bg-bg p-4">
            <span className="display block text-3xl">{s.n.toLocaleString()}</span>
            <span className="text-sm font-semibold text-ink2">{s.l}</span>
          </li>
        ))}
      </ul>

      <div className="grid min-w-0 gap-3">
        <h3 className="text-xl">Export</h3>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="btn" onClick={exportJson} disabled={empty}>Export everything (JSON)</button>
          <button type="button" className="btn secondary" onClick={exportCsv} disabled={!p.food.length}>Export food diary (CSV)</button>
        </div>
        <p className="text-sm text-muted">JSON has your profile, food, workouts, weigh-ins and saved foods. The CSV opens in any spreadsheet app.</p>
      </div>

      <div className="grid min-w-0 gap-3 rounded-[24px] border-2 border-tangerine p-4 md:p-5">
        <h3 className="text-xl">Delete all data</h3>
        <p className="max-w-prose">
          Permanently removes your profile, food diary, workouts, weigh-ins and saved foods from {where}. This can&apos;t be undone{p.cloud ? "" : ", and there's no copy anywhere else"}.
        </p>
        <AnimatePresence mode="wait" initial={false}>
          {stage === "idle" ? (
            <motion.div key="idle" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <button type="button" className="btn secondary" onClick={() => setStage("confirm")} disabled={empty}>Delete all data</button>
            </motion.div>
          ) : (
            <motion.div key="confirm" className="grid min-w-0 gap-3" initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="max-w-sm">
                <label className="lbl" htmlFor={inputId}>Type DELETE to confirm</label>
                <input id={inputId} className="field" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} autoFocus
                  onKeyDown={(e) => { if (e.key === "Enter") void del(); if (e.key === "Escape") { setStage("idle"); setTyped(""); } }} />
              </div>
              {err && <p role="alert" className="rounded-2xl bg-bubble px-4 py-2 font-bold">{err}</p>}
              <div className="flex flex-wrap gap-3">
                <button type="button" className="btn hot" onClick={del} disabled={busy || typed.trim() !== "DELETE"}>{busy ? "Deleting…" : "Delete everything"}</button>
                <button type="button" className="btn ghost" onClick={() => { setStage("idle"); setTyped(""); setErr(null); }} disabled={busy}>Cancel</button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
