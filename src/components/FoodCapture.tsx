"use client";
import { useId, useRef, useState } from "react";
import { useApp } from "@/components/AppProvider";
import type { EstimatedItem } from "@/lib/nutrition/estimate";
import { BarcodeSheet } from "./capture/BarcodeSheet";
import { PhotoSheet } from "./capture/PhotoSheet";
import { BarcodeIcon, CameraIcon } from "./capture/icons";

export interface CaptureResult {
  items: EstimatedItem[];
  source: "barcode" | "photo";
  /** "high" | "medium" | "low" when the source can tell */
  confidence?: string;
}

/**
 * Barcode and photo logging. The camera is only used after the person taps a button,
 * streams are stopped on close, and neither barcodes nor photos are kept.
 */
export function FoodCapture(props: { onResult: (r: CaptureResult) => void; disabledReason?: string | null }) {
  const { onResult, disabledReason } = props;
  const { cloud } = useApp();
  const [scanOpen, setScanOpen] = useState(false);
  const [photo, setPhoto] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const noteId = useId();

  const photoReason = disabledReason || (!cloud ? "Sign in to estimate from photos." : null);
  const pickPhoto = () => fileRef.current?.click();

  return (
    <div className="min-w-0">
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn secondary min-w-0 gap-1.5 px-2.5 text-center text-[0.95rem] leading-tight" disabled={!!disabledReason}
          aria-describedby={disabledReason ? noteId : undefined} onClick={() => setScanOpen(true)}>
          <BarcodeIcon />
          <span className="min-w-0">Scan barcode</span>
        </button>
        <button type="button" className="btn secondary min-w-0 gap-1.5 px-2.5 text-center text-[0.95rem] leading-tight" disabled={!!photoReason}
          aria-describedby={photoReason ? noteId : undefined} onClick={pickPhoto}>
          <CameraIcon />
          <span className="min-w-0">Snap a meal</span>
        </button>
      </div>
      {photoReason && <p id={noteId} className="muted mt-2 text-sm">{photoReason}</p>}

      <input
        ref={fileRef} type="file" accept="image/*" capture="environment" hidden tabIndex={-1} aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0] ?? null;
          e.target.value = ""; // lets the same photo be picked again and drops the reference
          if (f) setPhoto(f);
        }}
      />

      <BarcodeSheet
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onResult={(item) => { setScanOpen(false); onResult({ items: [item], source: "barcode" }); }}
      />
      <PhotoSheet
        file={photo}
        onClose={() => setPhoto(null)}
        onRetake={pickPhoto}
        onResult={(r) => { setPhoto(null); onResult({ items: r.items, source: "photo", confidence: r.confidence }); }}
      />
    </div>
  );
}
