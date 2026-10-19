"use client";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CloseIcon } from "./icons";

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),video[controls],[tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal sheet: bottom sheet on phones, centred dialog on larger screens.
 * Traps focus, closes on Esc or backdrop click, locks page scroll and gives focus back on close.
 */
export function Sheet({
  open, onClose, title, description, children,
}: { open: boolean; onClose: () => void; title: string; description?: string; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  const descId = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const el = panel.current;
    (el?.querySelector<HTMLElement>("[data-autofocus]:not([disabled])") ?? el)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); closeRef.current(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (!items.length) { e.preventDefault(); panel.current.focus(); return; }
      const first = items[0], last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      else if (!panel.current.contains(active)) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      const back = restoreTo.current;
      if (back && document.contains(back)) back.focus();
    };
  }, [open]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6">
          <motion.div
            aria-hidden
            className="absolute inset-0 bg-ink/55"
            onClick={onClose}
            initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0 }}
          />
          <motion.div
            ref={panel}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            className="relative flex max-h-[92dvh] w-full min-w-0 flex-col overflow-hidden rounded-t-[28px] border-2 border-ink bg-surface shadow-[0_-12px_40px_-12px_rgb(11_31_29/.45)] outline-none sm:max-w-lg sm:rounded-[28px]"
            initial={reduce ? false : { y: 48, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { y: 48, opacity: 0 }}
            transition={{ type: "spring", stiffness: 260, damping: 26 }}
          >
            <div className="flex items-start justify-between gap-3 border-b border-line px-5 pb-3 pt-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-[1.5rem]">{title}</h2>
                {description && <p id={descId} className="muted mt-1 text-sm">{description}</p>}
              </div>
              <button type="button" onClick={onClose} aria-label="Close"
                className="grid h-11 w-11 flex-none place-items-center rounded-full border-2 border-ink bg-surface hover:bg-sun">
                <CloseIcon />
              </button>
            </div>
            <div className="min-w-0 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
