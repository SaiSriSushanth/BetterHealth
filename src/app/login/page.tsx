"use client";
import { useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useApp } from "@/components/AppProvider";
import { Reveal, useReducedMotion } from "@/components/fx";
import { getSupabaseBrowser, hasSupabase } from "@/lib/supabase/client";

/** Big colour block frame shared by every state of the page. */
function Frame({ color = "block-sun", title, children }: { color?: string; title: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={`block ${color} mesh relative grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6 p-6 md:p-12`}
      initial={reduce ? false : { opacity: 0, scale: 0.94, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 160, damping: 18 }}>
      <span aria-hidden className="float pointer-events-none absolute -bottom-6 -right-6 size-20 rounded-full border-4 border-ink bg-bubble md:-top-6 md:bottom-auto md:size-40" />
      <h1 className="relative max-w-[12ch] text-[clamp(2.75rem,1rem+10vw,7rem)] leading-[.88] [text-wrap:balance]">{title}</h1>
      {children}
    </motion.div>
  );
}

export default function Login() {
  const { email: current, signOut, ready } = useApp();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!hasSupabase) {
    return (
      <Frame color="block-lime" title="Accounts aren't switched on.">
        <p className="relative max-w-prose text-lg font-medium">This copy of BetterHealth runs in demo mode: everything is saved on this device only. The site owner can turn on accounts by adding Supabase keys.</p>
        <div className="relative"><Link href="/" className="btn">Back to Today</Link></div>
      </Frame>
    );
  }
  if (!ready) return <div role="status" aria-label="Loading" className="piece h-40 animate-pulse" />;
  if (current) {
    return (
      <Frame color="block-teal" title="You're signed in.">
        <p className="relative max-w-prose text-lg font-medium"><b className="break-all">{current}</b>. Your plate, food diary and workouts sync to your account.</p>
        <div className="relative"><button className="btn" onClick={signOut}>Sign out</button></div>
      </Frame>
    );
  }
  async function send() {
    setBusy(true); setErr(null);
    const { error } = await getSupabaseBrowser()!.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${location.origin}/auth/callback` },
    });
    setBusy(false);
    if (error) setErr(error.message); else setSent(true);
  }
  if (sent) {
    return (
      <Frame color="block-bubble" title="Check your inbox.">
        <p className="relative max-w-prose text-lg font-medium">We sent a sign-in link to <b className="break-all">{email}</b>. Open it on this device. It can take a minute to arrive, and it may land in spam.</p>
        <div className="relative"><button className="btn secondary" onClick={() => setSent(false)}>Use a different email</button></div>
      </Frame>
    );
  }
  return (
    <Frame title="Sign in to sync.">
      <p className="relative max-w-prose text-lg font-medium">No password. We email you a link. Signing in unlocks the AI food estimator, coach and workout builder.</p>
      <Reveal className="relative max-w-xl">
        <div className="card grid gap-4 p-5">
          <div><label className="lbl" htmlFor="em">Email</label><input id="em" type="email" className="field !min-h-[64px] !text-xl" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && email && send()} /></div>
          {err && <p role="alert" className="rounded-2xl bg-bubble px-4 py-2 font-bold">{err}</p>}
          <div><button className="btn hot !min-h-[58px] !px-8 !text-lg" disabled={busy || !email.includes("@")} onClick={send}>{busy ? "Sending…" : "Email me a link"}</button></div>
        </div>
      </Reveal>
    </Frame>
  );
}
