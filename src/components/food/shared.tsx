"use client";
import { burst } from "@/components/fx";
import type { Meal, Nutrients } from "@/lib/types";

export const MEALS: Meal[] = ["breakfast", "lunch", "dinner", "snack"];
export const MEAL_BLOCK: Record<Meal, string> = {
  breakfast: "block-sun", lunch: "block-teal", dinner: "block-bubble", snack: "block-lime",
};
export const MEAL_BG: Record<Meal, string> = {
  breakfast: "bg-sun", lunch: "bg-teal", dinner: "bg-bubble", snack: "bg-lime",
};
export const spring = { type: "spring", stiffness: 380, damping: 26 } as const;

export function burstFrom(el: HTMLElement | null | undefined) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  burst(r.left + r.width / 2, r.top + r.height / 2);
}

const r = (x: number) => Math.round(x);
const grams = (x: number) => `${r(x)} ${r(x) === 1 ? "gram" : "grams"}`;

/** "P 12 · C 40 · F 8" with the units spoken properly for screen readers. */
export function Macros({ n, className = "" }: { n: Pick<Nutrients, "proteinG" | "carbsG" | "fatG">; className?: string }) {
  return (
    <span className={className}>
      <span aria-hidden className="whitespace-nowrap">P {r(n.proteinG)} · C {r(n.carbsG)} · F {r(n.fatG)}</span>
      <span className="sr-only">{grams(n.proteinG)} protein, {grams(n.carbsG)} carbs, {grams(n.fatG)} fat</span>
    </span>
  );
}

/** Star toggle. aria-pressed carries the state; the label names the food. */
export function StarButton({ on, name, onToggle, className = "" }: { on: boolean; name: string; onToggle: () => void; className?: string }) {
  return (
    <button type="button" aria-pressed={on} aria-label={`Favourite ${name}`} onClick={onToggle}
      className={`grid size-11 shrink-0 place-items-center rounded-full border-2 border-ink transition-transform hover:-rotate-12 motion-reduce:transition-none motion-reduce:hover:rotate-0 ${on ? "bg-sun" : "bg-white"} ${className}`}>
      <svg aria-hidden viewBox="0 0 24 24" className="size-5">
        <path d="M12 2.8l2.8 5.9 6.4.8-4.7 4.4 1.2 6.4L12 17.2l-5.7 3.1 1.2-6.4L2.8 9.5l6.4-.8z"
          fill={on ? "#0b1f1d" : "none"} stroke="#0b1f1d" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
