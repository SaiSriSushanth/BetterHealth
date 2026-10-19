"use client";
import { motion, useReducedMotion } from "motion/react";
import { useId, useState } from "react";
import { onTargetDay } from "@/lib/progress";
import type { DayTotals } from "@/lib/progress";
import { ChartTip, niceTicks, shortDate, SrTable, useWidth } from "./shared";

const H = 230, PL = 44, PR = 12, PT = 22, PB = 28;

/** Daily kcal columns against a dashed target line. On-target days are solid teal; others are hatched sun. */
export function CalorieBars({ days, target, summary }: { days: DayTotals[]; target: number; summary: string }) {
  const [box, W] = useWidth<HTMLDivElement>();
  const reduce = useReducedMotion();
  const pid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const top = Math.max(target * 1.25, ...days.map((d) => d.kcal)) * 1.05 || 1;
  const ticks = niceTicks(0, top, 4).filter((t) => t <= top);
  const iw = W - PL - PR, ih = H - PT - PB;
  const band = iw / Math.max(days.length, 1);
  const bw = Math.max(3, Math.min(34, band * 0.68));
  const y = (v: number) => PT + (1 - v / top) * ih;
  const base = PT + ih;
  const every = days.length <= 7 ? 1 : Math.ceil(days.length / (W < 480 ? 4 : 6));
  const labelFor = (d: string) => shortDate(d, days.length <= 7 ? { weekday: "short" } : { month: "short", day: "numeric" });
  const hd = hover !== null ? days[hover] : null;
  const status = (d: DayTotals) => (!d.logged ? "Nothing logged" : onTargetDay(d.kcal, target) ? "On target" : d.kcal > target ? "Over target" : "Under target");

  return (
    <figure className="m-0 min-w-0">
      <div ref={box} className="relative w-full">
        <svg role="img" aria-label={summary} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="block touch-pan-y" onPointerLeave={() => setHover(null)}>
          <defs>
            <pattern id={`h${pid}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--sun)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--ink)" strokeWidth="1.6" />
            </pattern>
            <clipPath id={`c${pid}`}><rect x={0} y={0} width={W} height={base} /></clipPath>
          </defs>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PL} x2={W - PR} y1={y(t)} y2={y(t)} stroke="var(--line)" />
              <text x={PL - 8} y={y(t) + 4} textAnchor="end" className="fill-muted text-[11px] font-semibold tabular-nums">{t >= 1000 ? `${(t / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })}k` : t}</text>
            </g>
          ))}
          <g clipPath={`url(#c${pid})`}>
            {days.map((d, i) => {
              const cx = PL + band * i + band / 2;
              if (!d.logged) return <circle key={d.day} cx={cx} cy={base - 3} r={2} fill="var(--muted)" />;
              const h = base - y(d.kcal);
              const on = onTargetDay(d.kcal, target);
              return (
                <motion.rect key={d.day + days.length} x={cx - bw / 2} width={bw} rx={Math.min(5, bw / 2)}
                  fill={on ? "var(--teal)" : `url(#h${pid})`} stroke="var(--ink)" strokeWidth={1.5}
                  initial={reduce ? false : { y: base, height: 0 }} animate={{ y: base - h, height: h + 6 }}
                  transition={{ type: "spring", stiffness: 90, damping: 15, delay: reduce ? 0 : i * (0.5 / days.length) }}
                  opacity={hover === null || hover === i ? 1 : 0.55} />
              );
            })}
          </g>
          <line x1={PL} x2={W - PR} y1={base} y2={base} stroke="var(--ink)" strokeWidth={1.5} />
          {target > 0 && (
            <g>
              <line x1={PL} x2={W - PR} y1={y(target)} y2={y(target)} stroke="var(--ink)" strokeWidth={2} strokeDasharray="6 4" />
              <rect x={W - PR - 92} y={y(target) - 21} width={92} height={18} rx={9} fill="var(--ink)" />
              <text x={W - PR - 46} y={y(target) - 8} textAnchor="middle" className="fill-white text-[11px] font-bold">Target {target.toLocaleString()}</text>
            </g>
          )}
          {days.map((d, i) => (i % every === (days.length - 1) % every ? (
            <text key={d.day} x={PL + band * i + band / 2} y={H - 8} textAnchor="middle" className="fill-muted text-[11px] font-semibold">{labelFor(d.day)}</text>
          ) : null))}
          {days.map((d, i) => (
            <rect key={`hit${d.day}`} x={PL + band * i} y={PT} width={band} height={ih} fill="transparent"
              onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)} />
          ))}
        </svg>
        {hd && (
          <ChartTip x={PL + band * hover! + band / 2} y={hd.logged ? y(hd.kcal) : base} width={W}>
            {shortDate(hd.day, { weekday: "short", month: "short", day: "numeric" })}: <b>{hd.logged ? `${Math.round(hd.kcal).toLocaleString()} kcal` : "nothing logged"}</b>
            {hd.logged && <span className="text-white/75"> · {status(hd).toLowerCase()}</span>}
          </ChartTip>
        )}
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold text-ink2">
        <span className="inline-flex items-center gap-2"><i aria-hidden className="inline-block size-3.5 rounded border-[1.5px] border-ink bg-teal" />Within 10% of target</span>
        <span className="inline-flex items-center gap-2"><svg aria-hidden width="14" height="14" className="rounded border-[1.5px] border-ink"><rect width="14" height="14" fill={`url(#h${pid})`} /></svg>Over or under</span>
        <span className="inline-flex items-center gap-2"><i aria-hidden className="inline-block size-1.5 rounded-full bg-muted" />No log</span>
      </figcaption>
      <SrTable caption="Calories per day" head={["Date", "Calories", "Status"]}
        rows={days.map((d) => [shortDate(d.day, { weekday: "short", month: "short", day: "numeric" }), d.logged ? Math.round(d.kcal) : "-", status(d)])} />
    </figure>
  );
}
