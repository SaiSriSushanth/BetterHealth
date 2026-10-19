"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGroup, motion } from "motion/react";
import { useApp } from "./AppProvider";
import { hasSupabase } from "@/lib/supabase/client";

const icon = (d: string) => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
);
const ITEMS = [
  { href: "/", label: "Today", bg: "var(--tangerine)", icon: icon("M3 11l9-7 9 7M5 10v10h14V10") },
  { href: "/food", label: "Food", bg: "var(--sun)", icon: icon("M6 3v7a3 3 0 003 3v8M9 3v5M12 3v7a3 3 0 01-3 3M17 3c-2 2-3 5-3 8h3v10") },
  { href: "/train", label: "Train", bg: "var(--teal)", icon: icon("M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12") },
  { href: "/progress", label: "Progress", bg: "var(--lime)", icon: icon("M4 19V9M10 19V5M16 19v-7M22 19H2") },
  { href: "/coach", label: "Coach", bg: "var(--bubble)", icon: icon("M4 5h16v11H9l-5 4z") },
];

function Mark({ size = 34 }: { size?: number }) {
  return (
    <motion.svg viewBox="0 0 28 28" width={size} height={size} aria-hidden="true" whileHover={{ rotate: 180, scale: 1.12 }} transition={{ type: "spring", stiffness: 200, damping: 12 }}>
      <circle cx="9" cy="9" r="7" fill="var(--tangerine)" /><circle cx="19" cy="9" r="7" fill="var(--sun)" />
      <circle cx="9" cy="19" r="7" fill="var(--bubble)" /><circle cx="19" cy="19" r="7" fill="var(--teal)" />
    </motion.svg>
  );
}

export function Nav() {
  const path = usePathname();
  const { email, ready } = useApp();
  const isOn = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  return (
    <LayoutGroup>
      <header className="flex items-center justify-between px-4 pb-1 pt-4 md:hidden">
        <Link href="/" className="flex items-center gap-2 font-display text-xl font-extrabold tracking-tight"><Mark />BetterHealth</Link>
        <Link href="/profile" className="rounded-full border-2 border-ink px-3 py-1 text-sm font-bold">Profile</Link>
      </header>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-24 flex-col items-center py-6 md:flex">
        <Link href="/" aria-label="BetterHealth home"><Mark size={44} /></Link>
        <nav aria-label="Main" className="mt-10 flex flex-col gap-3">
          {ITEMS.map((i) => {
            const on = isOn(i.href);
            return (
              <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
                className="group relative grid w-[68px] place-items-center gap-0.5 rounded-[22px] py-3 text-xs font-bold">
                {on && <motion.span layoutId="dock-d" className="absolute inset-0 rounded-[22px] border-2 border-ink" style={{ background: i.bg, boxShadow: "4px 4px 0 var(--ink)" }} transition={{ type: "spring", stiffness: 380, damping: 28 }} />}
                <span className="relative transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:rotate-[-8deg]">{i.icon}</span>
                <span className="relative">{i.label}</span>
              </Link>
            );
          })}
        </nav>
        <Link href="/profile" aria-current={path.startsWith("/profile") ? "page" : undefined}
          className="mt-auto grid size-12 place-items-center rounded-full border-2 border-ink bg-surface text-xs font-extrabold hover:bg-lime"
          aria-label={hasSupabase && ready && email ? `Profile and settings, signed in as ${email}` : "Profile and settings"}>
          {hasSupabase && ready && email ? email[0].toUpperCase() : "Me"}
        </Link>
      </aside>

      <nav aria-label="Main" className="fixed inset-x-3 bottom-3 z-30 grid grid-cols-5 rounded-[28px] bg-ink p-1.5 pb-[max(.375rem,env(safe-area-inset-bottom))] shadow-[0_18px_40px_-10px_rgb(11_31_29/.6)] md:hidden">
        {ITEMS.map((i) => {
          const on = isOn(i.href);
          return (
            <Link key={i.href} href={i.href} aria-current={on ? "page" : undefined}
              className={`relative grid place-items-center gap-0.5 rounded-[22px] py-2 text-[10px] font-bold ${on ? "text-ink" : "text-white/85"}`}>
              {on && <motion.span layoutId="dock-m" className="absolute inset-0 rounded-[22px]" style={{ background: i.bg }} transition={{ type: "spring", stiffness: 380, damping: 28 }} />}
              <span className="relative">{i.icon}</span><span className="relative">{i.label}</span>
            </Link>
          );
        })}
      </nav>
    </LayoutGroup>
  );
}
