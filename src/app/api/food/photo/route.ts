import { NextResponse } from "next/server";
import { authenticate, charge, cleanInput, photoModel, structured, webSearchJson } from "@/lib/ai/openai";
import { createDecomposer } from "@/lib/grounding/decompose";
import { groundItems } from "@/lib/grounding/ground";
import { resolveLocale } from "@/lib/grounding/locale";
import { saveWebRow, searchReference } from "@/lib/grounding/db";
import { buildVisionSystem, buildVisionUser } from "@/lib/grounding/prompt";
import { createWebLookup, WEB_SYSTEM, webJsonSchema } from "@/lib/grounding/web";
import { VisionOut, visionJsonSchema } from "@/lib/grounding/vision";
import { checkJpegDataUrl, MAX_IMAGE_BYTES } from "@/lib/image";
import { allItemsLookSane, makeBody, MAX_HINT, toResponseItem } from "./logic";

export const runtime = "nodejs";
// Vision call plus up to 3 parallel web lookups.
export const maxDuration = 60;

// The photo only lives in memory for this request: never stored, cached or logged.
const MAX_B64 = Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 64;
const Body = makeBody(MAX_B64);
/** No new web search is started after this many ms into the request. */
const WEB_DEADLINE_MS = 35000;

const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function POST(req: Request) {
  const started = Date.now();
  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_B64 + 4096) return bad("That photo is too large. Try again with a smaller one.");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return bad("Send one JPEG photo under 1.5 MB.");
  const check = checkJpegDataUrl(parsed.data.image);
  if (!check.ok) return bad(check.reason);

  const a = await authenticate();
  if (!a.ok) return NextResponse.json({ error: a.error, degraded: a.degraded ?? false }, { status: a.status });
  const g = await charge(a.userId, "photo");
  if (!g.ok) return NextResponse.json({ error: g.error, degraded: g.degraded ?? false }, { status: g.status });

  const loc = resolveLocale(parsed.data.locale);
  const hint = cleanInput(parsed.data.hint ?? "", MAX_HINT);

  try {
    const out = await structured({
      system: buildVisionSystem(loc.region), user: buildVisionUser(hint), name: "photo_nutrition",
      schema: VisionOut, jsonSchema: visionJsonSchema, maxTokens: 2200, imageDataUrl: parsed.data.image,
      model: photoModel(), temperature: 0, timeoutMs: 25000,
    });
    if (!out.items.length) {
      return NextResponse.json({ error: "We could not spot any food in that photo. Try again closer up, or add it by hand.", degraded: true }, { status: 200 });
    }

    const userId = a.userId;
    const web = createWebLookup({
      // Fail closed: any gate failure (auth, caps, tracking down, past deadline) silently skips the web stage.
      allow: async () => Date.now() - started < WEB_DEADLINE_MS && (await charge(userId, "web")).ok,
      fetchJson: (query) => webSearchJson({ system: WEB_SYSTEM, query: cleanInput(query, 100), name: "food_per_100g", jsonSchema: webJsonSchema, timeoutMs: 12000 }),
      save: saveWebRow,
    });

    const grounded = await groundItems(out.items, out.confidence, { regions: loc.searchRegions, search: searchReference, web, decompose: createDecomposer(loc.region, photoModel()) });
    if (!allItemsLookSane(grounded.items)) {
      return NextResponse.json({ error: "The estimate looked off, so we threw it away. Try another photo or add it by hand.", degraded: true }, { status: 200 });
    }
    return NextResponse.json({ items: grounded.items.map(toResponseItem), confidence: grounded.confidence, source: "photo" as const });
  } catch {
    return NextResponse.json({ error: "AI could not estimate that photo right now. Add it by hand instead.", degraded: true }, { status: 200 });
  }
}
