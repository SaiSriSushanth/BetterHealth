/** Photo helpers. Sizing and data-URL checks are pure; downscaleToJpeg runs in the browser only. */

export const MAX_SIDE = 1024;
export const JPEG_QUALITY = 0.8;
/** Server-side cap on the decoded JPEG. */
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

/** Fit width x height inside a max-side box, keeping aspect ratio. Never upscales. */
export function fitWithin(width: number, height: number, maxSide = MAX_SIDE): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 0, height: 0 };
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

const JPEG_PREFIX = "data:image/jpeg;base64,";

/** Decoded byte length of a base64 payload (no padding chars counted). */
export function base64Bytes(b64: string): number {
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

export type DataUrlCheck = { ok: true; bytes: number } | { ok: false; reason: string };

/** Only base64 JPEG data URLs, starting with the JPEG magic bytes, under maxBytes once decoded. */
export function checkJpegDataUrl(url: unknown, maxBytes = MAX_IMAGE_BYTES): DataUrlCheck {
  if (typeof url !== "string" || !url.startsWith(JPEG_PREFIX)) return { ok: false, reason: "Send a JPEG photo." };
  const b64 = url.slice(JPEG_PREFIX.length);
  if (b64.length < 8 || b64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return { ok: false, reason: "That photo could not be read." };
  const bytes = base64Bytes(b64);
  if (bytes > maxBytes) return { ok: false, reason: "That photo is too large. Try again with a smaller one." };
  // JPEG starts with FF D8 FF, which is "/9j/" in base64.
  if (!b64.startsWith("/9j/")) return { ok: false, reason: "That photo could not be read." };
  return { ok: true, bytes };
}

/**
 * Decode an image file, downscale it to MAX_SIDE and re-encode as JPEG.
 * Re-encoding through a canvas drops EXIF (including GPS location). Browser only.
 */
export async function downscaleToJpeg(file: Blob, maxSide = MAX_SIDE, quality = JPEG_QUALITY): Promise<{ dataUrl: string; width: number; height: number }> {
  let source: CanvasImageSource & { width: number; height: number; close?: () => void };
  try {
    source = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    source = await loadImage(file);
  }
  const { width, height } = fitWithin(source.width, source.height, maxSide);
  if (!width || !height) throw new Error("empty image");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("no canvas");
  ctx.fillStyle = "#fff"; // transparent PNGs would otherwise turn black
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  source.close?.();
  let q = quality;
  let dataUrl = canvas.toDataURL("image/jpeg", q);
  while (base64Bytes(dataUrl.slice(JPEG_PREFIX.length)) > MAX_IMAGE_BYTES * 0.9 && q > 0.4) {
    q -= 0.15;
    dataUrl = canvas.toDataURL("image/jpeg", q);
  }
  canvas.width = canvas.height = 0;
  return { dataUrl, width, height };
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode failed")); };
    img.src = url;
  });
}
