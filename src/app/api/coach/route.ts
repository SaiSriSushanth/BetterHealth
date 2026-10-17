import { NextResponse } from "next/server";
import { z } from "zod";
import { cleanInput, gate, structured } from "@/lib/ai/openai";
import { MUSCLES } from "@/lib/exercises";

const MUSCLE_IDS = MUSCLES.map((m) => m.id) as [string, ...string[]];
const n = z.number().min(0).max(10000);

export const runtime = "nodejs";
export const maxDuration = 30;

const Body = z.object({
  question: z.string().max(300).optional(),
  goal: z.enum(["lose", "maintain", "gain"]),
  targets: z.object({ kcal: n, proteinG: n, carbsG: n, fatG: n, fiberG: n }),
  today: z.object({ kcal: n, proteinG: n, carbsG: n, fatG: n, fiberG: n }),
  foods: z.array(z.string().max(80)).max(30),
  workoutsThisWeek: z.number().min(0).max(30),
  musclesTrainedThisWeek: z.array(z.enum(MUSCLE_IDS)).max(20),
});

const jsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["wins", "gap", "action", "reply"],
  properties: {
    wins: { type: "array", items: { type: "string" } },
    gap: { type: "string" },
    action: { type: "string" },
    reply: { type: "string" },
  },
};
const Out = z.object({
  wins: z.array(z.string().max(160)).max(3),
  gap: z.string().max(200),
  action: z.string().max(200),
  reply: z.string().max(500),
});

const SYSTEM = `You are the coach inside BetterHealth, a friendly fitness and nutrition app. Using the day's numbers, give up to 3 short wins, 1 gap, and 1 concrete action for tomorrow. If the user asked a question, answer it briefly in "reply"; otherwise write a one-sentence encouraging summary in "reply". Warm and plain-spoken, no emojis. Never diagnose, never give medical or medication advice, never recommend intakes below 1200 kcal. If the user mentions an eating disorder, self-harm or a medical condition, gently suggest talking to a doctor or a trusted person.`;

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const g = await gate("coach");
  if (!g.ok) return NextResponse.json({ error: g.error, degraded: g.degraded ?? false }, { status: g.status });
  const b = parsed.data;
  const question = cleanInput(b.question ?? "", 300);
  const user = JSON.stringify({
    goal: b.goal, targets: b.targets, eatenToday: b.today,
    foods: b.foods.map((f) => cleanInput(f, 80)),
    workoutsThisWeek: b.workoutsThisWeek, musclesTrained: b.musclesTrainedThisWeek, question,
  });
  try {
    const out = await structured({ system: SYSTEM, user, name: "coach", schema: Out, jsonSchema, maxTokens: 500 });
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ error: "The coach is taking a break. Try again in a minute.", degraded: true }, { status: 200 });
  }
}
