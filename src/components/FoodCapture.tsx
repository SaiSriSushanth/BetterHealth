"use client";
import type { EstimatedItem } from "@/lib/nutrition/estimate";

export interface CaptureResult {
  items: EstimatedItem[];
  source: "barcode" | "photo";
  /** "high" | "medium" | "low" when the source can tell */
  confidence?: string;
}

/** Barcode and photo logging. Placeholder: replaced by the photo/barcode build. */
export function FoodCapture(props: { onResult: (r: CaptureResult) => void; disabledReason?: string | null }) {
  void props;
  return null;
}
