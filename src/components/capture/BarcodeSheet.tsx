"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { BARCODE_FORMATS, lookupBarcode, validateBarcode, type ScannedProduct } from "@/lib/barcode";
import { scale, type EstimatedItem } from "@/lib/nutrition/estimate";
import { Sheet } from "./Sheet";

/* Minimal typing for the Shape Detection API (not in TS's DOM lib yet). */
interface DetectedBarcode { rawValue: string; format: string }
interface BarcodeDetectorLike { detect(src: CanvasImageSource): Promise<DetectedBarcode[]> }
interface BarcodeDetectorCtor {
  new (opts?: { formats: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
}

type Camera =
  | { state: "idle" }
  | { state: "starting" }
  | { state: "on" }
  | { state: "off"; why: string };

type Lookup =
  | { state: "none" }
  | { state: "loading"; code: string }
  | { state: "found"; product: ScannedProduct }
  | { state: "missing"; title: string; body: string };

const NO_CAPS = { textTransform: "none" } as const;
const MANUAL_HINT = "Type the numbers printed under the barcode instead.";

function cameraErrorText(e: unknown): string {
  const name = (e as { name?: string })?.name;
  if (name === "NotAllowedError" || name === "SecurityError") return `Camera access was blocked, so we cannot scan. You can allow the camera in your browser settings, or ${MANUAL_HINT.toLowerCase()}`;
  if (name === "NotFoundError" || name === "OverconstrainedError") return `We could not find a camera on this device. ${MANUAL_HINT}`;
  if (name === "NotReadableError") return `The camera is busy in another app. Close that app and try again, or ${MANUAL_HINT.toLowerCase()}`;
  return `The camera did not start. ${MANUAL_HINT}`;
}

export function BarcodeSheet({ open, onClose, onResult }: {
  open: boolean;
  onClose: () => void;
  onResult: (item: EstimatedItem) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const loopRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /** true only while the sheet is open; guards streams that resolve after close */
  const activeRef = useRef(false);
  const [camera, setCamera] = useState<Camera>({ state: "idle" });
  const [lookup, setLookup] = useState<Lookup>({ state: "none" });
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [grams, setGrams] = useState("100");
  const ids = { code: useId(), codeErr: useId(), grams: useId(), gramsErr: useId(), status: useId() };

  const stopCamera = useCallback(() => {
    if (loopRef.current !== null) { clearTimeout(loopRef.current); loopRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const runLookup = useCallback(async (raw: string) => {
    const v = validateBarcode(raw);
    if (!v.ok) { setCodeError(v.reason); return; }
    setCodeError(null);
    stopCamera();
    setCamera((c) => (c.state === "on" || c.state === "starting" ? { state: "idle" } : c));
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLookup({ state: "loading", code: v.code });
    const r = await lookupBarcode(v.code, { signal: ctrl.signal });
    if (ctrl.signal.aborted) return;
    if (r.kind === "found") {
      setGrams(String(r.product.serving.grams));
      setLookup({ state: "found", product: r.product });
    } else if (r.kind === "not_found") {
      setLookup({ state: "missing", title: "We could not find that product", body: `Barcode ${r.code} is not in Open Food Facts yet. Check the numbers, or close this and enter the food by hand.` });
    } else if (r.kind === "no_nutrition") {
      setLookup({ state: "missing", title: `${r.name} has no nutrition data`, body: "Open Food Facts knows this product but not its nutrition. Close this and enter it by hand using the label on the pack." });
    } else {
      setLookup({ state: "missing", title: "The lookup did not work", body: `${r.message} You can also enter the food by hand.` });
    }
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    const Detector = (globalThis as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;
    if (!Detector) { setCamera({ state: "off", why: `This browser cannot read barcodes from the camera. ${MANUAL_HINT}` }); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setCamera({ state: "off", why: `This browser does not allow camera access here. ${MANUAL_HINT}` }); return; }
    let detector: BarcodeDetectorLike;
    try {
      const supported = (await Detector.getSupportedFormats?.()) ?? [...BARCODE_FORMATS];
      const formats = BARCODE_FORMATS.filter((f) => supported.includes(f));
      if (!formats.length) { setCamera({ state: "off", why: `This browser cannot read food barcodes from the camera. ${MANUAL_HINT}` }); return; }
      detector = new Detector({ formats });
    } catch {
      setCamera({ state: "off", why: `This browser cannot read barcodes from the camera. ${MANUAL_HINT}` }); return;
    }
    if (!activeRef.current) return;
    setCamera({ state: "starting" });
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    } catch (e) {
      setCamera({ state: "off", why: cameraErrorText(e) }); return;
    }
    const video = videoRef.current;
    if (!activeRef.current || !video) { stream.getTracks().forEach((t) => t.stop()); return; } // sheet closed while asking
    streamRef.current = stream;
    video.srcObject = stream;
    try { await video.play(); } catch { /* autoplay with muted+playsInline should work; the loop still tries */ }
    setCamera({ state: "on" });
    const tick = async () => {
      if (!streamRef.current) return;
      try {
        if (video.readyState >= 2) {
          const found = await detector.detect(video);
          for (const b of found) {
            const raw = b.rawValue.replace(/\D/g, "");
            if (validateBarcode(raw).ok) { setCode(raw); void runLookup(raw); return; }
          }
        }
      } catch { /* a frame can fail to decode; keep going */ }
      if (streamRef.current) loopRef.current = window.setTimeout(tick, 250);
    };
    loopRef.current = window.setTimeout(tick, 300);
  }, [runLookup]);

  // Camera starts only when the sheet is opened by the person's click, and always stops on close/unmount.
  useEffect(() => {
    if (!open) return;
    activeRef.current = true;
    setLookup({ state: "none" }); setCode(""); setCodeError(null); setCamera({ state: "idle" });
    const t = window.setTimeout(() => void startCamera(), 0);
    return () => {
      activeRef.current = false;
      clearTimeout(t);
      abortRef.current?.abort();
      stopCamera();
    };
  }, [open, startCamera, stopCamera]);

  const scanAgain = () => {
    setLookup({ state: "none" }); setCode(""); setCodeError(null);
    void startCamera();
  };

  const product = lookup.state === "found" ? lookup.product : null;
  const g = Math.round(Number(grams));
  const gramsValid = Number.isFinite(g) && g >= 1 && g <= 5000;
  const scaled = product && gramsValid ? scale(product.per100, g / 100) : null;

  const useIt = () => {
    if (!product || !scaled) return;
    const portion = g === product.serving.grams ? product.serving.label : `${g} ${product.unit}`;
    onResult({ name: product.name, portion, grams: g, nutrients: scaled });
  };

  const showScanner = lookup.state === "none" || lookup.state === "missing";

  return (
    <Sheet open={open} onClose={onClose} title="Scan barcode" description="Point your camera at the barcode on the pack, or type its numbers.">
      <p id={ids.status} role="status" aria-live="polite" className="sr-only">
        {camera.state === "on" ? "Camera on. Hold the barcode inside the frame." : ""}
        {lookup.state === "loading" ? "Looking up the product." : ""}
        {lookup.state === "found" ? `Found ${lookup.product.name}.` : ""}
        {lookup.state === "missing" ? lookup.title : ""}
      </p>

      {showScanner && (
        <div className="grid gap-4">
          {(camera.state === "starting" || camera.state === "on") && (
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[20px] bg-ink">
              <video ref={videoRef} muted playsInline aria-label="Camera preview" className="h-full w-full object-cover" />
              <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
                <div className="h-[38%] w-[78%] rounded-2xl border-[3px] border-lime shadow-[0_0_0_9999px_rgb(11_31_29/.45)]" />
              </div>
              <p className="absolute inset-x-0 bottom-0 bg-ink/80 px-3 py-2 text-center text-sm font-semibold text-white">
                {camera.state === "starting" ? "Starting the camera..." : "Hold the barcode inside the frame"}
              </p>
            </div>
          )}
          {camera.state === "off" && (
            <p className="rounded-[18px] border-2 border-ink bg-sun px-4 py-3 text-sm font-medium">{camera.why}</p>
          )}
          {camera.state === "idle" && lookup.state === "missing" && (
            <button type="button" className="btn secondary w-full" onClick={scanAgain}>Scan with camera</button>
          )}

          {lookup.state === "missing" && (
            <div className="rounded-[18px] border-2 border-ink bg-bubble px-4 py-3">
              <p className="font-bold">{lookup.title}</p>
              <p className="mt-1 text-sm">{lookup.body}</p>
            </div>
          )}

          <form noValidate onSubmit={(e) => { e.preventDefault(); void runLookup(code); }} className="grid gap-2">
            <label htmlFor={ids.code} className="lbl">Barcode number</label>
            <div className="flex min-w-0 gap-2">
              <input
                id={ids.code} data-autofocus={camera.state === "off" ? true : undefined}
                className="field min-w-0 flex-1 tracking-wider" inputMode="numeric" autoComplete="off" enterKeyHint="search"
                placeholder="e.g. 3017620422003" maxLength={18} value={code}
                aria-invalid={codeError ? true : undefined} aria-describedby={codeError ? ids.codeErr : undefined}
                onChange={(e) => { setCode(e.target.value.replace(/[^\d\s-]/g, "")); setCodeError(null); }}
              />
              <button type="submit" className="btn flex-none px-5">Look up</button>
            </div>
            {codeError
              ? <p id={ids.codeErr} className="text-sm font-semibold text-[#b3261e]">{codeError}</p>
              : <p className="muted text-sm">8 to 14 digits. Only the number is sent to Open Food Facts.</p>}
          </form>
        </div>
      )}

      {lookup.state === "loading" && (
        <div className="grid gap-3 py-6 text-center" aria-busy="true">
          <p className="font-bold">Looking up {lookup.code}...</p>
          <button type="button" className="btn ghost mx-auto" onClick={() => { abortRef.current?.abort(); setLookup({ state: "none" }); }}>Cancel</button>
        </div>
      )}

      {product && (
        <div className="grid gap-4">
          <div className="rounded-[20px] border-2 border-ink bg-lime px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-wide">Found</p>
            <p className="font-display text-xl font-extrabold leading-tight [overflow-wrap:anywhere]">{product.name}</p>
            <p className="text-sm">{product.per100.kcal} kcal per 100 {product.unit}{product.packSize ? ` · pack ${product.packSize}` : ""}</p>
          </div>

          <fieldset className="grid gap-2">
            <legend className="lbl">How much did you have?</legend>
            <div className="flex flex-wrap gap-2">
              {product.serving.grams !== 100 && (
                <button type="button" className="chip" style={NO_CAPS} aria-pressed={g === product.serving.grams} onClick={() => setGrams(String(product.serving.grams))}>
                  {product.serving.label}
                </button>
              )}
              {[50, 100, 200].filter((v) => v === 100 || v !== product.serving.grams).map((v) => (
                <button key={v} type="button" className="chip" style={NO_CAPS} aria-pressed={g === v} onClick={() => setGrams(String(v))}>{v} {product.unit}</button>
              ))}
            </div>
            <label htmlFor={ids.grams} className="lbl mt-1">{product.unit === "ml" ? "Millilitres" : "Grams"}</label>
            <input id={ids.grams} className="field" type="number" inputMode="decimal" min={1} max={5000} step={1}
              value={grams} onChange={(e) => setGrams(e.target.value)} aria-invalid={!gramsValid || undefined} aria-describedby={gramsValid ? undefined : ids.gramsErr} />
            {!gramsValid && <p id={ids.gramsErr} className="text-sm font-semibold text-[#b3261e]">Enter between 1 and 5000 {product.unit === "ml" ? "ml" : "grams"}.</p>}
          </fieldset>

          {scaled && (
            <dl className="grid grid-cols-4 gap-2 text-center" aria-live="polite">
              {([["kcal", scaled.kcal, ""], ["Protein", scaled.proteinG, "g"], ["Carbs", scaled.carbsG, "g"], ["Fat", scaled.fatG, "g"]] as const).map(([k, v, u]) => (
                <div key={k} className="min-w-0 rounded-2xl bg-bg px-1 py-2">
                  <dt className="muted text-xs font-semibold">{k}</dt>
                  <dd className="font-display text-lg font-extrabold">{v}{u}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="muted text-xs">Data from Open Food Facts, a free database anyone can edit. Check it against the label if it looks off.</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn hot flex-1" disabled={!scaled} onClick={useIt}>Use this</button>
            <button type="button" className="btn secondary flex-1" onClick={scanAgain}>Scan another</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
