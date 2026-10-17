"use client";
import type { MuscleGroup } from "@/lib/types";

interface Shape { views: ("front" | "back")[]; d: string; mirror: boolean }

// Right-hand-side outlines (x > 100) are mirrored for the left; centre pieces are drawn once.
const SHAPES: Record<string, Shape> = {
  neck: { views: ["front"], mirror: false, d: "M90 56 L110 56 L114 76 L86 76 Z" },
  traps: { views: ["back"], mirror: false, d: "M100 54 Q113 56 123 64 Q139 76 147 88 L100 130 L53 88 Q61 76 77 64 Q87 56 100 54 Z" },
  shoulders: { views: ["front", "back"], mirror: true, d: "M128 80 Q158 72 168 98 Q170 118 150 120 Q136 112 128 96 Z" },
  chest: { views: ["front"], mirror: true, d: "M102 84 Q128 80 134 102 Q132 122 102 126 Z" },
  lats: { views: ["back"], mirror: true, d: "M104 134 L132 104 Q148 116 144 152 Q138 182 120 192 L104 186 Z" },
  lowerback: { views: ["back"], mirror: false, d: "M88 150 L112 150 L114 204 L86 204 Z" },
  abs: { views: ["front"], mirror: false, d: "M88 130 L112 130 L112 198 Q100 206 88 198 Z" },
  obliques: { views: ["front"], mirror: true, d: "M116 132 Q132 136 134 162 Q134 186 124 200 L114 198 Q118 162 116 132 Z" },
  biceps: { views: ["front"], mirror: true, d: "M152 124 Q164 122 168 130 Q172 160 164 178 Q152 180 148 172 Q146 142 152 124 Z" },
  triceps: { views: ["back"], mirror: true, d: "M152 124 Q164 122 168 130 Q172 160 164 178 Q152 180 148 172 Q146 142 152 124 Z" },
  forearms: { views: ["front", "back"], mirror: true, d: "M148 184 Q162 182 170 186 Q184 224 182 252 Q170 258 164 252 Q152 222 148 184 Z" },
  glutes: { views: ["back"], mirror: true, d: "M100 208 Q124 202 138 214 Q142 238 126 250 Q108 252 100 242 Z" },
  quads: { views: ["front"], mirror: true, d: "M114 216 Q132 210 140 218 Q144 272 130 316 Q116 318 112 302 Q108 264 114 216 Z" },
  adductors: { views: ["front"], mirror: false, d: "M100 206 Q111 216 110 252 Q108 282 100 294 Q92 282 90 252 Q89 216 100 206 Z" },
  hamstrings: { views: ["back"], mirror: true, d: "M104 254 Q130 250 138 258 Q142 292 130 324 Q116 326 110 310 Q104 282 104 254 Z" },
  calves: { views: ["back"], mirror: true, d: "M112 332 Q130 328 134 338 Q136 374 126 404 Q114 406 112 392 Q108 362 112 332 Z" },
};

const AREA_COLOR: Record<MuscleGroup["area"], string> = {
  upper: "var(--tangerine)", arms: "var(--bubble)", core: "var(--sun)", lower: "var(--teal)",
};
const TICK_Y: Record<string, number> = { neck: 70, traps: 100, shoulders: 104, chest: 108, lats: 150, lowerback: 182, abs: 168, obliques: 170, biceps: 156, triceps: 156, forearms: 224, glutes: 232, quads: 270, adductors: 258, hamstrings: 296, calves: 372 };
const tint = (c: string) => `color-mix(in srgb, ${c} 26%, white)`;

export function BodyMap({
  view, muscles, trained, selected, onSelect,
}: {
  view: "front" | "back";
  muscles: MuscleGroup[];
  trained: Set<string>;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <svg viewBox="0 0 200 430" role="group" aria-label={`${view} view of the body`} className="h-auto w-full">
      <ellipse cx="104" cy="424" rx="64" ry="5" fill="var(--teal-d)" opacity=".18" />
      <circle cx="100" cy="34" r="24" fill="#d9e4e1" />
      {/* decorative cut-outs: hands, hips, lower legs */}
      <g fill="#e6eeec">
        <path d="M86 76 L114 76 L120 84 L80 84 Z" />
        <path d="M80 200 Q100 190 120 200 L124 214 L76 214 Z" />
        <circle cx="176" cy="268" r="9" /><circle cx="24" cy="268" r="9" />
        {view === "front" && <><path d="M112 324 Q128 322 130 326 Q130 380 124 410 L114 410 Q110 372 112 324 Z" /><path d="M88 324 Q72 322 70 326 Q70 380 76 410 L86 410 Q90 372 88 324 Z" /></>}
      </g>
      {muscles.filter((m) => SHAPES[m.id]?.views.includes(view)).map((m) => {
        const s = SHAPES[m.id];
        const on = trained.has(m.id);
        const sel = selected === m.id;
        const fill = on ? AREA_COLOR[m.area] : tint(AREA_COLOR[m.area]);
        return (
          <g key={m.id} className="muscle" role="button" tabIndex={0} aria-pressed={sel}
            aria-label={`${m.label}, ${view} view, ${on ? "trained this week" : "not trained this week"}`}
            onClick={() => onSelect(m.id)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(m.id); } }}>
            <path d={s.d} fill={fill} stroke={sel ? "var(--ink)" : "rgb(11 43 40 / .35)"} strokeWidth={sel ? 2.5 : 0.9} strokeLinejoin="round" />
            {s.mirror && <path d={s.d} transform="translate(200 0) scale(-1 1)" fill={fill} stroke={sel ? "var(--ink)" : "rgb(11 43 40 / .35)"} strokeWidth={sel ? 2.5 : 0.9} strokeLinejoin="round" />}
            {on && <text x={s.mirror ? 150 : 100} y={TICK_Y[m.id] ?? 150} textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--ink)" aria-hidden="true">✓</text>}
          </g>
        );
      })}
    </svg>
  );
}
