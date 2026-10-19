import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticate, charge, structured } from "@/lib/ai/openai";
import { checkJpegDataUrl, MAX_IMAGE_BYTES } from "@/lib/image";
import { itemsLookSane, PHOTO_SYSTEM, PhotoOut, photoJsonSchema, toItems } from "./logic";

export const runtime = "nodejs";
export const maxDuration = 30;

// The photo only lives in memory for this request: never stored, cached or logged.
const MAX_B64 = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64;
const Body = z.object({ image: z.string().max(MAX_B64) });

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function POST(req: Request) {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_B64 + 1024) return bad("That photo is too large. Try again with a smaller one.");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Send one JPEG photo under 1.5 MB.");
  const check = checkJpegDataUrl(parsed.data.image);
  if (!check.ok) return bad(check.reason);

  const a = await authenticate();
  if (!a.ok) return NextResponse.json({ error: a.error, degraded: a.degraded ?? false }, { status: a.status });
  const g = await charge(a.userId, "photo");
  if (!g.ok) return NextResponse.json({ error: g.error, degraded: g.degraded ?? false }, { status: g.status });

  try {
    const out = await structured({
      system: PHOTO_SYSTEM, user: "Photo of food I ate.", name: "photo_nutrition",
      schema: PhotoOut, jsonSchema: photoJsonSchema, maxTokens: 900, imageDataUrl: parsed.data.image,
    });
    const items = toItems(out);
    if (!items.length) {
      return NextResponse.json({ error: "We could not spot any food in that photo. Try again closer up, or add it by hand.", degraded: true }, { status: 200 });
    }
    if (!itemsLookSane(items)) {
      return NextResponse.json({ error: "The estimate looked off, so we threw it away. Try another photo or add it by hand.", degraded: true }, { status: 200 });
    }
    return NextResponse.json({ items, confidence: out.confidence, source: "photo" as const });
  } catch {
    return NextResponse.json({ error: "AI could not estimate that photo right now. Add it by hand instead.", degraded: true }, { status: 200 });
  }
}
