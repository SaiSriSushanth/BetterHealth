"use client";
import { motion, useReducedMotion } from "motion/react";
import { useId, useMemo, useState } from "react";
import { dayNum } from "@/lib/progress";
import type { WeightPoint } from "@/lib/progress";
import { ChartTip, niceTicks, shortDate, SrTable, useWidth } from "./shared";

interface Props {
  points: WeightPoint[];
  trend: WeightPoint[];
  min: WeightPoint | null;
  max: WeightPoint | null;
  /** first and last day of the range */
  from: string;
  to: string;
  /** converts kg to the display unit */
  toUnit(kg: number): number;
  unit: string;
  /** optional dashed reference line (kg) */
  reference?: { kg: number; label: string } | null;
  summary: string;
}

const PL = 44, PR = 16, PT = 26, PB = 30;

/** Weigh-ins as dots + thin line, a bold smoothed trend with a soft area, min/max markers and a crosshair. */
export function WeightChart({ points, trend, min, max, from, to, toUnit, unit, reference, summary }: Props) {
  const [box, W] = useWidth<HTMLDivElement>();
  const reduce = useReducedMotion();
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  const H = W >= 560 ? 330 : 260;

  const g = useMemo(() => {
    const x0 = dayNum(from), x1 = Math.max(dayNum(to), x0 + 1);
    const vals = [...points, ...trend].map((p) => toUnit(p.kg));
    if (reference) vals.push(toUnit(reference.kg));
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = Math.max((hi - lo) * 0.15, 0.6);
    lo -= pad; hi += pad;
    const ticks = niceTicks(lo, hi, H > 300 ? 5 : 4);
    const iw = W - PL - PR, ih = H - PT - PB;
    const x = (day: string) => PL + ((dayNum(day) - x0) / (x1 - x0)) * iw;
    const y = (kg: number) => PT + (1 - (toUnit(kg) - lo) / (hi - lo)) * ih;
    const line = (pts: WeightPoint[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.kg).toFixed(1)}`).join("");
    const trendD = line(trend);
    const area = trend.length > 1 ? `${trendD}L${x(trend[trend.length - 1].day).toFixed(1)},${PT + ih}L${x(trend[0].day).toFixed(1)},${PT + ih}Z` : "";
    const yt = (v: number) => PT + (1 - (v - lo) / (hi - lo)) * ih;
    const span = x1 - x0;
    const xTicks = [from, ...(span > 20 ? [new Date((x0 + span / 2) * 86_400_000).toISOString().slice(0, 10)] : []), to];
    return { x, y, yt, rawD: line(points), trendD, area, ticks, iw, ih, xTicks };
  }, [points, trend, from, to, toUnit, reference, W, H]);

  const trendAt = (day: string) => trend.find((t) => t.day === day);
  const fmtV = (kg: number) => toUnit(kg).toFixed(1);
  const draw = reduce ? { initial: false as const } : { initial: { pathLength: 0 }, animate: { pathLength: 1 } };
  const key = `${from}-${points.length}`;
  const dots = points.length <= 60;

  const pick = (clientX: number, rect: DOMRect) => {
    const px = ((clientX - rect.left) / rect.width) * W;
    let best = 0, bd = Infinity;
    points.forEach((p, i) => { const d = Math.abs(g.x(p.day) - px); if (d < bd) { bd = d; best = i; } });
    setHover(points.length ? best : null);
  };
  const hp = hover !== null ? points[hover] : null;

  const marker = (p: WeightPoint, kind: "Low" | "High") => {
    const cx = g.x(p.day), cy = g.y(p.kg);
    const anchor = cx < PL + 40 ? "start" : cx > W - PR - 40 ? "end" : "middle";
    const ty = kind === "High" ? cy - 12 : cy + 20;
    return (
      <g key={kind}>
        <circle cx={cx} cy={cy} r={6.5} fill="var(--surface)" stroke="var(--ink)" strokeWidth={2.5} />
        <text x={cx} y={Math.min(Math.max(ty, 12), H - PB - 2)} textAnchor={anchor} className="fill-ink text-[11px] font-bold">{kind} {fmtV(p.kg)}</text>
      </g>
    );
  };

  return (
    <figure className="m-0 min-w-0">
      <div ref={box} className="relative w-full">
        <svg role="img" aria-label={summary} viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className="block overflow-visible touch-pan-y rounded-lg"
          tabIndex={points.length ? 0 : -1}
          onKeyDown={(e) => {
            if (!points.length) return;
            if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
              e.preventDefault();
              setHover((h) => Math.min(points.length - 1, Math.max(0, (h ?? points.length - 1) + (e.key === "ArrowLeft" ? -1 : 1))));
            } else if (e.key === "Escape") setHover(null);
          }}
          onBlur={() => setHover(null)}
          onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerDown={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setHover(null)}>
          <defs>
            <linearGradient id={`a${gid}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--teal)" stopOpacity={0.38} />
              <stop offset="100%" stopColor="var(--teal)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          {g.ticks.map((t) => (
            <g key={t}>
              <line x1={PL} x2={W - PR} y1={g.yt(t)} y2={g.yt(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={PL - 8} y={g.yt(t) + 4} textAnchor="end" className="fill-muted text-[11px] font-semibold tabular-nums">{t % 1 ? t.toFixed(1) : t}</text>
            </g>
          ))}
          <text x={PL - 8} y={PT - 12} textAnchor="end" className="fill-muted text-[11px] font-bold">{unit}</text>
          {g.xTicks.map((d, i) => (
            <text key={d + i} x={g.x(d)} y={H - 8} textAnchor={i === 0 ? "start" : i === g.xTicks.length - 1 ? "end" : "middle"} className="fill-muted text-[11px] font-semibold">{shortDate(d)}</text>
          ))}

          {reference && (
            <g>
              <line x1={PL} x2={W - PR} y1={g.y(reference.kg)} y2={g.y(reference.kg)} stroke="var(--ink)" strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="5 5" />
              <text x={PL + 6} y={g.y(reference.kg) - 6} textAnchor="start" className="fill-ink2 text-[11px] font-bold">{reference.label}</text>
            </g>
          )}

          {g.area && (
            <motion.path key={`area${key}`} d={g.area} fill={`url(#a${gid})`}
              initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.5 }} />
          )}
          {points.length > 1 && (
            <motion.path key={`raw${key}`} d={g.rawD} fill="none" stroke="var(--ink)" strokeOpacity={0.35} strokeWidth={1.5} strokeLinejoin="round"
              {...draw} transition={{ duration: 1.1, ease: [0.3, 0.7, 0.2, 1] }} />
          )}
          {trend.length > 1 && (
            <motion.path key={`trend${key}`} d={g.trendD} fill="none" stroke="var(--ink)" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round"
              {...draw} transition={{ type: "spring", stiffness: 40, damping: 16, delay: 0.15 }} />
          )}
          {dots && points.map((p, i) => (
            <motion.circle key={`${p.day}${key}`} cx={g.x(p.day)} cy={g.y(p.kg)} r={4} fill="var(--teal)" stroke="var(--ink)" strokeWidth={1.5}
              initial={reduce ? false : { scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              style={{ transformBox: "fill-box", transformOrigin: "center" }}
              transition={{ type: "spring", stiffness: 300, damping: 15, delay: 0.3 + (i / points.length) * 0.8 }} />
          ))}
          {points.length > 1 && min && max && min.kg !== max.kg && [marker(max, "High"), marker(min, "Low")]}

          {hp && (
            <g aria-hidden>
              <line x1={g.x(hp.day)} x2={g.x(hp.day)} y1={PT} y2={H - PB} stroke="var(--ink)" strokeWidth={1} />
              <circle cx={g.x(hp.day)} cy={g.y(hp.kg)} r={7} fill="var(--sun)" stroke="var(--ink)" strokeWidth={2.5} />
            </g>
          )}
        </svg>
        {hp && (
          <ChartTip x={g.x(hp.day)} y={g.y(hp.kg)} width={W}>
            {shortDate(hp.day, { weekday: "short", month: "short", day: "numeric" })}: <b>{fmtV(hp.kg)} {unit}</b>
            {trendAt(hp.day) && <span className="text-white/75"> · trend {fmtV(trendAt(hp.day)!.kg)}</span>}
          </ChartTip>
        )}
      </div>
      <figcaption className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm font-semibold text-ink2">
        <span className="inline-flex items-center gap-2"><i aria-hidden className="inline-block size-3 rounded-full border-[1.5px] border-ink bg-teal" />Weigh-in</span>
        <span className="inline-flex items-center gap-2"><i aria-hidden className="inline-block h-1 w-6 rounded-full bg-ink" />7-day trend</span>
        {reference && <span className="inline-flex items-center gap-2"><i aria-hidden className="inline-block w-6 border-t-2 border-dashed border-ink/60" />{reference.label}</span>}
      </figcaption>
      <SrTable caption={`Weight in ${unit}`} head={["Date", `Weight (${unit})`, `Trend (${unit})`]}
        rows={points.map((p) => [shortDate(p.day, { year: "numeric", month: "short", day: "numeric" }), fmtV(p.kg), trendAt(p.day) ? fmtV(trendAt(p.day)!.kg) : ""])} />
    </figure>
  );
}
