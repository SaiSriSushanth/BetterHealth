"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/components/AppProvider";
import { Onboarding } from "@/components/Onboarding";
import { Reveal, useReducedMotion } from "@/components/fx";
import { computeTargets, validateProfile } from "@/lib/goals";
import { DEFAULT_REMINDERS, clearFired, normalizeReminders } from "@/lib/reminders";
import type { Profile, Reminders } from "@/lib/types";
import { type DraftFields, buildProfile, fieldsFromProfile, isDirty, switchUnits } from "@/components/profile/draft";
import { ActivityPicker, BodyNumbers, EquipmentPicker, GoalPicker, NameField, SexPicker, UnitsToggle } from "@/components/profile/fields";
import { TargetsPreview } from "@/components/profile/TargetsPreview";
import { RemindersSection } from "@/components/profile/RemindersSection";
import { AccountSection } from "@/components/profile/AccountSection";
import { DataSection } from "@/components/profile/DataSection";
import { Portal } from "@/components/profile/Portal";

const LEAVE_MSG = "You have unsaved changes. Leave without saving?";
const H2 = "text-[clamp(1.9rem,1.2rem+2.5vw,3rem)]";

type ToastMsg = { id: number; title: string; body?: string };

function Toast({ msg, onClose }: { msg: ToastMsg | null; onClose: () => void }) {
  const reduce = useReducedMotion();
  useEffect(() => {
    if (!msg) return;
    const id = setTimeout(onClose, 4500);
    return () => clearTimeout(id);
  }, [msg, onClose]);
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-3 top-4 z-50 flex justify-center md:left-32 md:top-6">
      <AnimatePresence>
        {msg && (
          <motion.div key={msg.id} className="pointer-events-auto flex min-w-0 max-w-md items-start gap-3 rounded-[22px] border-2 border-ink bg-teal p-4 pr-2 text-ink shadow-[5px_5px_0_var(--ink)]"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -20, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -12 }} transition={{ type: "spring", stiffness: 380, damping: 28 }}>
            <svg aria-hidden viewBox="0 0 24 24" className="mt-0.5 size-6 shrink-0"><circle cx="12" cy="12" r="11" fill="#fff" stroke="#0b1f1d" strokeWidth="2" /><path d="M7 12.5l3.5 3.5L17 9" fill="none" stroke="#0b1f1d" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <div className="min-w-0 flex-1">
              <p className="font-bold">{msg.title}</p>
              {msg.body && <p className="text-sm font-medium">{msg.body}</p>}
            </div>
            <button type="button" onClick={onClose} className="grid size-11 shrink-0 place-items-center rounded-full font-bold hover:bg-ink/10" aria-label="Close message">
              <svg aria-hidden viewBox="0 0 24 24" className="size-5"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Warn before leaving with unsaved edits: tab close/reload and in-app link clicks. */
function useLeaveGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.hasAttribute("download")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.hash)) return;
      if (!window.confirm(LEAVE_MSG)) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => { window.removeEventListener("beforeunload", onUnload); document.removeEventListener("click", onClick, true); };
  }, [dirty]);
}

function fieldOf(problem: string | null): "age" | "height" | "weight" | null {
  if (!problem) return null;
  return problem.startsWith("Age") ? "age" : problem.startsWith("Height") ? "height" : "weight";
}

function Editor({ profile, toast }: { profile: Profile; toast: (t: string, b?: string) => void }) {
  const app = useApp();
  const reduce = useReducedMotion();
  const [initial, setInitial] = useState<DraftFields>(() => fieldsFromProfile(profile));
  const [f, setF] = useState<DraftFields>(initial);
  const [initialR, setInitialR] = useState<Reminders>(() => normalizeReminders(profile.reminders));
  const [r, setR] = useState<Reminders>(initialR);
  const [saving, setSaving] = useState(false);
  const [showErr, setShowErr] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const set = (patch: Partial<DraftFields>) => setF((x) => ({ ...x, ...patch }));
  const draft = useMemo(() => buildProfile(f, profile, initial), [f, profile, initial]);
  const problem = validateProfile(draft);
  const before = useMemo(() => computeTargets(profile), [profile]);
  const after = problem ? null : computeTargets(draft);
  const formDirty = isDirty(f, initial);
  const remDirty = JSON.stringify(r) !== JSON.stringify(initialR);
  const dirty = formDirty || remDirty;
  useLeaveGuard(dirty);

  function discard() { setF(initial); setR(initialR); setShowErr(false); setSaveErr(null); }

  async function save() {
    setShowErr(true); setSaveErr(null);
    if (problem) { document.getElementById(fieldOf(problem) === "age" ? "p-age" : fieldOf(problem) === "height" ? (f.imperial ? "p-ft" : "p-cm") : "p-wt")?.focus(); return; }
    // only store reminders once someone has set them up, so untouched profiles stay as they were
    const keepReminders = profile.reminders || JSON.stringify(r) !== JSON.stringify(DEFAULT_REMINDERS);
    const next: Profile = { ...draft, ...(keepReminders ? { reminders: r } : {}) };
    setSaving(true);
    try {
      await app.saveProfile(next);
      const nf = fieldsFromProfile(next);
      setInitial(nf); setF(nf); setInitialR(r); setShowErr(false);
      const t = computeTargets(next);
      toast("Profile saved", t.kcal !== before.kcal ? `Your daily plate is now ${t.kcal.toLocaleString()} kcal.` : remDirty && !formDirty ? "Reminder settings updated." : undefined);
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : "Could not save. Try again.");
    } finally { setSaving(false); }
  }

  async function signOut() {
    if (dirty && !window.confirm(LEAVE_MSG)) return;
    setSigningOut(true);
    try { await app.signOut(); } finally { setSigningOut(false); }
  }

  async function deleteAll() {
    await app.deleteAllData();
    try { clearFired(window.localStorage); } catch { /* ignore */ }
    toast("All data deleted", app.cloud ? "Your account is empty now." : "Nothing is left on this device.");
  }

  const errShown = showErr && problem;
  const dk = after ? after.kcal - before.kcal : 0;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 pb-24">
      <header className="grid min-w-0 gap-3">
        <span className="sticker w-fit">{app.cloud ? "Synced to your account" : "Saved on this device"}</span>
        <h1 className="mega break-words">Hi, {profile.name}.</h1>
        <p className="max-w-prose text-lg text-ink2">Change your details and your daily plate updates as you go. Nothing changes until you save.</p>
      </header>

      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_330px]">
        <aside className="min-w-0 lg:sticky lg:top-8 lg:order-last lg:self-start">
          <TargetsPreview before={before} after={after} problem={problem} />
        </aside>

        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
          <Reveal as="section" className="block block-sun grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 p-5 md:p-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h2 className={H2}>About you</h2>
              <UnitsToggle imperial={f.imperial} onChange={(v) => setF((x) => switchUnits(x, v, profile, initial))} />
            </div>
            <NameField f={f} set={set} idPrefix="p-" />
            <SexPicker f={f} set={set} />
            <BodyNumbers f={f} set={set} idPrefix="p-" invalid={errShown ? fieldOf(problem) : null} />
            {errShown && <p id="p-body-err" role="alert" className="rounded-2xl border-2 border-ink bg-surface px-4 py-2 font-bold">{problem}.</p>}
          </Reveal>

          <Reveal as="section" className="card grid min-w-0 gap-4 p-5 md:p-8">
            <GoalPicker f={f} set={set} legend="Your goal" legendClass={`mb-4 font-display font-extrabold tracking-tight ${H2}`} />
          </Reveal>

          <Reveal as="section" className="block block-teal grid min-w-0 grid-cols-[minmax(0,1fr)] gap-8 p-5 md:p-8">
            <ActivityPicker f={f} set={set} legend="How active you are" legendClass={`mb-4 font-display font-extrabold tracking-tight ${H2}`} onColor="bg-lime" />
            <EquipmentPicker f={f} set={set} legend="Equipment you can use" legendClass="mb-3 font-display text-2xl font-extrabold tracking-tight" />
          </Reveal>
        </div>
      </div>

      <Reveal><RemindersSection value={r} onChange={setR} dirty={remDirty} onTest={(t, b) => toast(t, b)} /></Reveal>
      <Reveal><AccountSection email={app.email} cloud={app.cloud} onSignOut={signOut} busy={signingOut} /></Reveal>
      <Reveal>
        <DataSection profile={app.profile} targets={app.targets} food={app.food} workouts={app.workouts} weights={app.weights} customFoods={app.customFoods} cloud={app.cloud} onDelete={deleteAll} />
      </Reveal>

      <Portal><AnimatePresence>
        {dirty && (
          <motion.div className="fixed inset-x-3 bottom-[6.5rem] z-40 md:bottom-6 md:left-32 md:right-8"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? { opacity: 0 } : { opacity: 0, y: 40 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}>
            <div role="region" aria-label="Unsaved changes" className="mx-auto flex max-w-5xl min-w-0 flex-wrap items-center gap-3 rounded-[26px] border-2 border-ink bg-surface p-2.5 pl-5 shadow-[6px_6px_0_var(--ink)]">
              <p className="min-w-0 flex-1 basis-40 font-bold leading-tight">
                Unsaved changes
                {dk !== 0 && <span className="block text-sm font-semibold text-ink2">{dk > 0 ? "+" : "−"}{Math.abs(dk)} kcal a day</span>}
                {saveErr && <span role="alert" className="block text-sm font-bold text-ink">{saveErr}</span>}
              </p>
              <div className="flex gap-2">
                <button type="button" className="btn ghost !px-4" onClick={discard} disabled={saving}>Discard</button>
                <button type="button" className="btn hot !px-6" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save changes"}</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence></Portal>
    </div>
  );
}

export default function ProfilePage() {
  const app = useApp();
  const [msg, setMsg] = useState<ToastMsg | null>(null);
  const toast = useCallback((title: string, body?: string) => setMsg({ id: Date.now(), title, body }), []);
  const close = useCallback(() => setMsg(null), []);

  let content: React.ReactNode;
  if (!app.ready) content = <div role="status" aria-label="Loading" className="block block-sun h-72 animate-pulse" />;
  else if (app.error) content = <p role="alert" className="block block-bubble p-5 font-semibold">{app.error}</p>;
  else if (!app.profile) {
    content = (
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-10">
        <Onboarding />
        <AccountSection email={app.email} cloud={app.cloud} onSignOut={() => void app.signOut()} />
      </div>
    );
  } else content = <Editor profile={app.profile} toast={toast} />;

  return (
    <>
      {content}
      <Portal><Toast msg={msg} onClose={close} /></Portal>
    </>
  );
}
