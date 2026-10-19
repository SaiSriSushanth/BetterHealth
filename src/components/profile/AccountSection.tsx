"use client";
import Link from "next/link";
import { hasSupabase } from "@/lib/supabase/client";

function Place({ title, sub, active }: { title: string; sub: string; active: boolean }) {
  return (
    <div className={`relative min-w-0 rounded-[22px] border-2 p-4 ${active ? "border-lime bg-lime text-ink" : "border-white/30 text-white"}`}>
      <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
        {title}
        {active && <span className="rounded-full border-2 border-ink bg-surface px-2 py-0.5 text-xs font-extrabold">In use</span>}
      </p>
      <p className={`mt-1 text-sm ${active ? "font-medium" : "text-white/80"}`}>{sub}</p>
    </div>
  );
}

export function AccountSection({ email, cloud, onSignOut, busy }: { email: string | null; cloud: boolean; onSignOut: () => void; busy?: boolean }) {
  return (
    <section aria-labelledby="acct-h" className="block block-ink grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 p-5 md:p-8 [&_*:focus-visible]:outline-white">
      <div className="min-w-0">
        <h2 id="acct-h" className="text-[clamp(1.9rem,1.2rem+2.5vw,3rem)]">Account</h2>
        {!hasSupabase ? (
          <p className="mt-2 max-w-prose text-white/90">
            You&apos;re in demo mode. Accounts aren&apos;t switched on for this copy of BetterHealth, so everything is saved in this browser only. Clearing your browser data or switching devices will lose it, so export a copy below if it matters to you.
          </p>
        ) : email ? (
          <p className="mt-2 max-w-prose text-white/90">Signed in as <b className="break-all text-white">{email}</b>. Your data syncs to your account, so you&apos;ll see it on any device you sign in on.</p>
        ) : (
          <p className="mt-2 max-w-prose text-white/90">You&apos;re not signed in. Your data is saved in this browser only. Sign in with your email to keep it safe and use it on other devices.</p>
        )}
      </div>

      <div className="grid min-w-0 gap-3 sm:grid-cols-2">
        <Place title="This device" sub="Saved in this browser. Private, but lost if you clear site data." active={!cloud} />
        <Place title="Your account" sub={hasSupabase ? "Stored securely with your account and synced across devices." : "Not available in demo mode."} active={cloud} />
      </div>

      {hasSupabase && (
        <div className="flex flex-wrap gap-3">
          {email
            ? <button type="button" className="btn secondary" onClick={onSignOut} disabled={busy}>{busy ? "Signing out…" : "Sign out"}</button>
            : <Link href="/login" className="btn secondary">Sign in</Link>}
        </div>
      )}
    </section>
  );
}
