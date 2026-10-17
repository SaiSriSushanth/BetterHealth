import { NextResponse } from "next/server";
import { z } from "zod";
import { gate, structured } from "@/lib/ai/openai";
import { EXERCISES, MUSCLES } from "@/lib/exercises";

export const runtime = "nodejs";
export const maxDuration = 30;

const muscleIds = MUSCLES.map((m) => m.id);
const Body = z.object({
  muscles: z.array(z.enum(muscleIds as [string, ...string[]])).min(1).max(6),
  equipment: z.array(z.enum(["bodyweight", "dumbbell", "barbell", "cable", "machine", "band"])).min(1),
  level: z.enum(["beginner", "intermediate", "advanced"]),
  minutes: z.number().int().min(10).max(120),
});

const Out = z.object({
  title: z.string().max(80),
  blocks: z.array(z.object({
    exerciseId: z.string(), sets: z.number().int().min(1).max(8), reps: z.number().int().min(1).max(30), restSec: z.number().int().min(0).max(300),
  })).min(1).max(12),
});

const SYSTEM = `You build workouts. Choose ONLY exercise ids from the provided list. Fit the time budget (about 5 minutes per exercise including rests), cover the requested muscles, match the level. Give the workout a short, upbeat title.`;

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request." }, { status: 400 });
  const g = await gate("workout");
  if (!g.ok) return NextResponse.json({ error: g.error, degraded: g.degraded ?? false }, { status: g.status });
  const b = parsed.data;
  const pool = EXERCISES.filter((e) => b.muscles.includes(e.muscleId) && b.equipment.includes(e.equipment));
  if (!pool.length) return NextResponse.json({ error: "No exercises match that equipment. Add more equipment and retry.", degraded: true });
  const ids = pool.map((e) => e.id);
  const jsonSchema = {
    type: "object", additionalProperties: false, required: ["title", "blocks"],
    properties: {
      title: { type: "string" },
      blocks: {
        type: "array",
        items: {
          type: "object", additionalProperties: false, required: ["exerciseId", "sets", "reps", "restSec"],
          properties: { exerciseId: { type: "string", enum: ids }, sets: { type: "integer" }, reps: { type: "integer" }, restSec: { type: "integer" } },
        },
      },
    },
  };
  try {
    const out = await structured({
      system: SYSTEM, name: "workout", schema: Out, jsonSchema, maxTokens: 700,
      user: JSON.stringify({ level: b.level, minutes: b.minutes, exercises: pool.map((e) => ({ id: e.id, name: e.name, muscle: e.muscleId, difficulty: e.difficulty })) }),
    });
    const blocks = out.blocks.filter((x) => ids.includes(x.exerciseId));
    if (!blocks.length) throw new Error("no valid blocks");
    return NextResponse.json({ title: out.title, blocks });
  } catch {
    return NextResponse.json({ error: "AI could not build a workout right now. Pick moves from the body map instead.", degraded: true });
  }
}
