import { describe, expect, it } from "vitest";
import { base64Bytes, checkJpegDataUrl, fitWithin, MAX_IMAGE_BYTES } from "./image";

const jpeg = (b64: string) => `data:image/jpeg;base64,${b64}`;

describe("fitWithin", () => {
  it("scales the longest side down to the max", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(3024, 4032)).toEqual({ width: 768, height: 1024 });
    expect(fitWithin(2000, 2000, 1024)).toEqual({ width: 1024, height: 1024 });
    expect(fitWithin(4000, 10)).toEqual({ width: 1024, height: 3 });
  });
  it("never upscales and never returns 0 for a real image", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(10000, 1)).toEqual({ width: 1024, height: 1 });
  });
  it("handles empty or invalid sizes", () => {
    expect(fitWithin(0, 100)).toEqual({ width: 0, height: 0 });
    expect(fitWithin(NaN, 100)).toEqual({ width: 0, height: 0 });
  });
});

describe("checkJpegDataUrl", () => {
  it("computes decoded size", () => {
    expect(base64Bytes("AAAA")).toBe(3);
    expect(base64Bytes("AAA=")).toBe(2);
    expect(base64Bytes("AA==")).toBe(1);
  });
  it("accepts a JPEG data URL", () => {
    expect(checkJpegDataUrl(jpeg("/9j/4AAQSkZJRg=="))).toEqual({ ok: true, bytes: 10 });
  });
  it("rejects other types, bad base64, non-JPEG bytes and oversize", () => {
    expect(checkJpegDataUrl("data:image/png;base64,iVBORw0KGgo=").ok).toBe(false);
    expect(checkJpegDataUrl(123).ok).toBe(false);
    expect(checkJpegDataUrl(jpeg("/9j/4AAQ*kZJRg==")).ok).toBe(false);
    expect(checkJpegDataUrl(jpeg("iVBORw0KGgoAAAA=")).ok).toBe(false);
    const big = "/9j/" + "A".repeat(Math.ceil((MAX_IMAGE_BYTES + 10) / 3) * 4);
    expect(checkJpegDataUrl(jpeg(big))).toMatchObject({ ok: false, reason: expect.stringMatching(/too large/) });
  });
});
