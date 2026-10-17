"use client";
import { animate, motion, useMotionValue, useSpring, useTransform, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";

export { useReducedMotion };

/** Fades and lifts children into view once. Respects reduced motion. */
export function Reveal({
  children, delay = 0, y = 28, className, as = "div",
}: { children: React.ReactNode; delay?: number; y?: number; className?: string; as?: "div" | "section" | "li" | "header" | "p" }) {
  const reduce = useReducedMotion();
  const M = motion[as] as typeof motion.div;
  return (
    <M className={className} initial={reduce ? false : { opacity: 0, y }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-8% 0px" }} transition={{ type: "spring", stiffness: 120, damping: 18, delay }}>
      {children}
    </M>
  );
}

/** Counts up to a number when it scrolls into view and re-tweens when the value changes. */
export function CountUp({ value, className, duration = 1.1 }: { value: number; className?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const from = useRef(0);
  useEffect(() => {
    if (!inView || !ref.current) return;
    if (reduce) { ref.current.textContent = Math.round(value).toLocaleString(); return; }
    const c = animate(from.current, value, {
      duration, ease: [0.2, 0.8, 0.2, 1],
      onUpdate: (v) => { if (ref.current) ref.current.textContent = Math.round(v).toLocaleString(); },
    });
    from.current = value;
    return () => c.stop();
  }, [inView, value, duration, reduce]);
  return <span ref={ref} className={className}>{reduce ? Math.round(value).toLocaleString() : "0"}</span>;
}

/** 3D pointer tilt with a moving highlight. Children sit on a slightly raised layer. */
export function Tilt({ children, className, max = 9 }: { children: React.ReactNode; className?: string; max?: number }) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0.5), y = useMotionValue(0.5);
  const sx = useSpring(x, { stiffness: 200, damping: 20 }), sy = useSpring(y, { stiffness: 200, damping: 20 });
  const rx = useTransform(sy, [0, 1], [max, -max]);
  const ry = useTransform(sx, [0, 1], [-max, max]);
  const glow = useTransform([sx, sy], ([a, b]) => `radial-gradient(500px circle at ${(a as number) * 100}% ${(b as number) * 100}%, rgb(255 255 255 / .28), transparent 45%)`);
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <div style={{ perspective: 900 }} className="h-full">
      <motion.div
        className={`relative h-full ${className ?? ""}`}
        style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); x.set((e.clientX - r.left) / r.width); y.set((e.clientY - r.top) / r.height); }}
        onPointerLeave={() => { x.set(0.5); y.set(0.5); }}
        whileHover={{ scale: 1.015 }}
      >
        {children}
        <motion.span aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: glow }} />
      </motion.div>
    </div>
  );
}

/** Pulls its child toward the pointer. */
export function Magnetic({ children, strength = 0.3 }: { children: React.ReactNode; strength?: number }) {
  const reduce = useReducedMotion();
  const x = useSpring(useMotionValue(0), { stiffness: 250, damping: 15 });
  const y = useSpring(useMotionValue(0), { stiffness: 250, damping: 15 });
  if (reduce) return <>{children}</>;
  return (
    <motion.div className="inline-block" style={{ x, y }}
      onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); x.set((e.clientX - r.left - r.width / 2) * strength); y.set((e.clientY - r.top - r.height / 2) * strength); }}
      onPointerLeave={() => { x.set(0); y.set(0); }}>
      {children}
    </motion.div>
  );
}

export function Marquee({ items, className }: { items: string[]; className?: string }) {
  const row = (
    <div aria-hidden>
      {items.map((t, i) => <span key={i} className="flex items-center gap-10">{t}<i className="size-3 rounded-full bg-current" /></span>)}
    </div>
  );
  return <div className={`marquee ${className ?? ""}`}>{row}{row}</div>;
}

const COLORS = ["#ff5a1f", "#ffd23f", "#0fb5a6", "#ff8cc6", "#d7ff3f"];
/** Confetti burst from a point (defaults to the middle of the screen). Skips under reduced motion. */
export function burst(x = innerWidth / 2, y = innerHeight / 2, count = 36) {
  if (typeof document === "undefined" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  for (let i = 0; i < count; i++) {
    const el = document.createElement("i");
    const s = 6 + Math.random() * 8;
    Object.assign(el.style, {
      position: "fixed", left: `${x}px`, top: `${y}px`, width: `${s}px`, height: `${s * (Math.random() > 0.5 ? 1 : 0.45)}px`,
      background: COLORS[i % COLORS.length], borderRadius: Math.random() > 0.5 ? "50%" : "2px", pointerEvents: "none", zIndex: "9999",
    });
    document.body.appendChild(el);
    const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 190;
    el.animate(
      [{ transform: "translate(0,0) rotate(0)", opacity: 1 },
       { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d - 60}px) rotate(${Math.random() * 540}deg)`, opacity: 1, offset: 0.55 },
       { transform: `translate(${Math.cos(a) * d * 1.2}px, ${Math.sin(a) * d + 180}px) rotate(${Math.random() * 900}deg)`, opacity: 0 }],
      { duration: 1100 + Math.random() * 500, easing: "cubic-bezier(.2,.7,.3,1)" },
    ).onfinish = () => el.remove();
  }
}

/** True once mounted and only if the browser can create a WebGL context. */
export function useWebGL() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    try {
      const c = document.createElement("canvas");
      setOk(Boolean(c.getContext("webgl2") || c.getContext("webgl")));
    } catch { setOk(false); }
  }, []);
  return ok;
}
