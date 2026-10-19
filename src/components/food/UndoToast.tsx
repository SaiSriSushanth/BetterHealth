"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useReducedMotion } from "@/components/fx";

export interface Toast { id: number; text: string; onUndo?: () => void }

/** Bottom toast with an Undo button. Disappears after `ms` unless hovered or focused. */
export function UndoToast({ toast, onClose, ms = 6000 }: { toast: Toast | null; onClose: () => void; ms?: number }) {
  const reduce = useReducedMotion();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; });

  const start = () => { stop(); timer.current = setTimeout(() => close.current(), ms); };
  const stop = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };

  useEffect(() => {
    if (!toast) return;
    timer.current = setTimeout(() => close.current(), ms);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [toast, ms]);

  // Portal to <body>: the page transition wrapper is transformed, which would break position: fixed.
  const [host, setHost] = useState<HTMLElement | null>(null);
  useEffect(() => setHost(document.body), []);
  if (!host) return null;

  return createPortal(
    <div aria-live="polite" className="pointer-events-none fixed inset-x-3 bottom-[6.5rem] z-40 flex justify-center md:bottom-6 md:left-28">
      <AnimatePresence>
        {toast && (
          <motion.div key={toast.id} role="status" onMouseEnter={stop} onMouseLeave={start} onFocus={stop} onBlur={start}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.95 }} transition={{ type: "spring", stiffness: 420, damping: 28 }}
            className="pointer-events-auto flex min-w-0 max-w-md items-center gap-3 rounded-full border-2 border-ink bg-ink py-1.5 pl-5 pr-1.5 text-white shadow-[0_18px_40px_-10px_rgb(11_31_29/.6)]">
            <span className="min-w-0 truncate font-semibold">{toast.text}</span>
            {toast.onUndo && (
              <button className="btn hot !min-h-11 shrink-0 !px-5 text-sm focus-visible:!outline-white" onClick={() => { toast.onUndo?.(); onClose(); }}>Undo</button>
            )}
            <button className="grid size-11 shrink-0 place-items-center rounded-full text-white hover:bg-white/15 focus-visible:!outline-white" aria-label="Dismiss" onClick={onClose}>
              <svg aria-hidden viewBox="0 0 24 24" className="size-4"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /></svg>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>,
    host,
  );
}
