"use client";
import { useEffect, useRef, useState } from "react";
import { downscaleToJpeg } from "@/lib/image";
import type { EstimatedItem } from "@/lib/nutrition/estimate";
import { Sheet } from "./Sheet";

type Phase =
  | { state: "preparing" }
  | { state: "preview" }
  | { state: "sending" }
  | { state: "failed"; message: string };

export interface PhotoEstimate { items: EstimatedItem[]; confidence?: string }

/** Region hints for the server: browser language and timezone only, nothing more precise. */
function browserLocale() {
  try {
    return { lang: navigator.language, tz: Intl.DateTimeFormat().resolvedOptions().timeZone };
  } catch {
    return {};
  }
}

const ROUGH_NOTE = "Photo estimates are rough. Check the portions before saving.";

/**
 * Shows the chosen photo (already downscaled and stripped of EXIF), then sends it for an estimate.
 * The photo stays in memory only; it is dropped when the sheet closes.
 */
export function PhotoSheet({ file, onClose, onRetake, onResult }: {
  file: File | null;
  onClose: () => void;
  onRetake: () => void;
  onResult: (r: PhotoEstimate) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ state: "preparing" });
  const [image, setImage] = useState<string | null>(null);
  const [hint, setHint] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!file) { setImage(null); return; }
    let cancelled = false;
    setImage(null);
    setHint("");
    setPhase({ state: "preparing" });
    if (!file.type.startsWith("image/")) {
      setPhase({ state: "failed", message: "That file is not a photo. Choose a photo of your meal." });
      return;
    }
    downscaleToJpeg(file)
      .then((r) => { if (!cancelled) { setImage(r.dataUrl); setPhase({ state: "preview" }); } })
      .catch(() => { if (!cancelled) setPhase({ state: "failed", message: "We could not open that photo. Try another one, or take a new photo." }); });
    return () => { cancelled = true; abortRef.current?.abort(); };
  }, [file]);

  const send = async () => {
    if (!image) return;
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const timer = setTimeout(() => ctrl.abort(), 35000);
    setPhase({ state: "sending" });
    try {
      const res = await fetch("/api/food/photo", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image, locale: browserLocale(), ...(hint.trim() ? { hint: hint.trim() } : {}) }), signal: ctrl.signal,
      });
      const data = await res.json().catch(() => null) as { items?: EstimatedItem[]; confidence?: string; error?: string } | null;
      if (res.ok && data?.items?.length) { onResult({ items: data.items, confidence: data.confidence }); return; }
      const fallback = res.status === 401 ? "Sign in to estimate from photos."
        : res.status === 429 ? "You have used today's photo estimates. They reset tomorrow."
          : "We could not estimate that photo. Try again, or add the food by hand.";
      setPhase({ state: "failed", message: data?.error || fallback });
    } catch {
      if (ctrl.signal.aborted && abortRef.current !== ctrl) return;
      setPhase({ state: "failed", message: ctrl.signal.aborted ? "That took too long. Check your connection and try again." : "Could not reach the server. Check your connection and try again." });
    } finally {
      clearTimeout(timer);
    }
  };

  const close = () => { abortRef.current?.abort(); abortRef.current = null; onClose(); };

  return (
    <Sheet open={file !== null} onClose={close} title="Snap a meal" description={ROUGH_NOTE}>
      <div className="grid gap-4">
        <div className="relative grid aspect-[4/3] w-full place-items-center overflow-hidden rounded-[20px] border-2 border-ink bg-bg">
          {image
            // eslint-disable-next-line @next/next/no-img-element -- local data URL preview, never uploaded to an image CDN
            ? <img src={image} alt="Your meal photo" className="h-full w-full object-cover" />
            : <p className="muted px-4 text-center text-sm">{phase.state === "failed" ? "No photo" : "Preparing photo..."}</p>}
          {phase.state === "sending" && (
            <div className="absolute inset-0 grid place-items-center bg-ink/60">
              <p className="rounded-full bg-surface px-4 py-2 text-sm font-bold">Estimating...</p>
            </div>
          )}
        </div>

        <p role="status" aria-live="polite" className={phase.state === "failed" ? "rounded-[18px] border-2 border-ink bg-bubble px-4 py-3 text-sm font-medium" : "sr-only"}>
          {phase.state === "failed" ? phase.message : phase.state === "sending" ? "Estimating the food in your photo." : phase.state === "preview" ? "Photo ready." : ""}
        </p>

        <label className="grid gap-1.5">
          <span className="text-sm font-bold">Anything we can&apos;t see? (optional)</span>
          <input className="field" type="text" maxLength={140} value={hint} disabled={phase.state === "sending"}
            onChange={(e) => setHint(e.target.value)} placeholder="e.g. cooked in 2 tsp ghee, homemade" />
        </label>

        <div className="flex flex-wrap gap-2">
          {phase.state !== "failed" || image ? (
            <button type="button" className="btn hot flex-1" data-autofocus disabled={!image || phase.state === "sending"} onClick={send}>
              {phase.state === "sending" ? "Estimating..." : phase.state === "failed" ? "Try again" : "Use photo"}
            </button>
          ) : null}
          <button type="button" className="btn secondary flex-1" onClick={onRetake} disabled={phase.state === "sending"}>Retake</button>
        </div>
        <p className="muted text-xs">Your photo is sent once for the estimate and is not saved. Location data is removed first. Your browser language and time zone help us pick local foods.</p>
      </div>
    </Sheet>
  );
}
