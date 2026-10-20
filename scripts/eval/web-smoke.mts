// Live smoke test of the web-search fallback. No Supabase writes, no auth, no charge().
// Run: npx --yes tsx scripts/eval/web-smoke.mts
// Never prints any part of the API key. .env.local takes precedence over the shell environment.
import { readFileSync } from "node:fs";
import OpenAI from "openai";
import { createWebLookup, validateWebResult, WEB_SYSTEM, webJsonSchema } from "../../src/lib/grounding/web";
import { runWebSearchJson } from "../../src/lib/grounding/websearch";

function loadEnvLocal(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (!m) continue;
      out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* no .env.local */
  }
  return out;
}

const env = loadEnvLocal();
const apiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
const model = env.OPENAI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini";
if (!apiKey) {
  console.log("No OPENAI_API_KEY found in .env.local or the environment.");
  process.exit(1);
}
const client = new OpenAI({ apiKey, timeout: 20000, maxRetries: 0 });
console.log(`model=${model} (key source: ${env.OPENAI_API_KEY ? ".env.local" : "shell"})`);

for (const query of ["ragi mudde", "vada pav", "bhel puri"]) {
  let raw: unknown = null;
  let error = "";
  const lookup = createWebLookup({
    allow: async () => true,
    save: async () => undefined,
    fetchJson: async (q) => {
      try {
        raw = await runWebSearchJson(client, model, { system: WEB_SYSTEM, query: q, name: "food_per_100g", jsonSchema: webJsonSchema, timeoutMs: 20000 });
      } catch (e) {
        const err = e as { name?: string; status?: number; code?: string; message?: string };
        error = `${err.name ?? "Error"} status=${err.status ?? "-"} code=${err.code ?? "-"} message=${(err.message ?? "").replace(apiKey, "***").slice(0, 300)}`;
        throw e;
      }
      return raw;
    },
  });
  const t0 = Date.now();
  const row = (await lookup(query)) as (Awaited<ReturnType<typeof lookup>> & { meta?: { urls: string[] } }) | null;
  const ms = Date.now() - t0;
  console.log(`\n== ${query} (${ms} ms)`);
  if (error) { console.log(`REQUEST FAILED: ${error}`); continue; }
  const verdict = validateWebResult(raw);
  console.log(`sanity verdict: ${verdict ? "PASS" : "REJECTED"}${row ? "" : " (lookup returned null)"}`);
  const r = raw as { found?: boolean; per100?: Record<string, number>; urls?: string[] } | null;
  if (r?.per100) {
    const p = r.per100;
    console.log(`found=${r.found} per100g: kcal=${p.kcal} protein=${p.protein_g} carbs=${p.carbs_g} fat=${p.fat_g}`);
    console.log(`urls: ${(row?.meta?.urls ?? r.urls ?? []).join(" | ") || "(none)"}`);
  }
}
