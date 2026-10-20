// Upserts normalised reference food rows (see docs/GROUNDING.md) into public.reference_foods.
// Usage: node scripts/ref/import.mjs [--dry] data/reference/ifct.json data/reference/usda_sr.json ...
// Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local (values are never printed).
import { readFileSync, existsSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const files = args.filter((a) => !a.startsWith("--"));
if (!files.length) { console.error("Pass at least one rows file."); process.exit(1); }

function loadEnv() {
  const env = { ...process.env };
  if (existsSync(".env.local")) {
    for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const KEYS = ["kcal", "proteinG", "carbsG", "fatG", "fiberG", "sugarG", "sodiumMg", "potassiumMg", "calciumMg", "ironMg", "vitCMg"];
const SOURCES = new Set(["ifct", "usda_sr", "usda_fndds", "usda_foundation", "web"]);
const REGIONS = new Set(["IN", "US", "GLOBAL"]);
const STATES = new Set(["raw", "cooked", "dish", "unknown"]);

function check(r) {
  if (!r || typeof r !== "object") return "not an object";
  if (typeof r.id !== "string" || !r.id.includes(":")) return "bad id";
  if (!SOURCES.has(r.source)) return "bad source";
  if (typeof r.code !== "string" || !r.code) return "bad code";
  if (typeof r.name !== "string" || !r.name.trim() || r.name.length > 200) return "bad name";
  if (!REGIONS.has(r.region ?? "GLOBAL")) return "bad region";
  if (!STATES.has(r.state ?? "unknown")) return "bad state";
  for (const k of KEYS) if (!Number.isFinite(r.per100?.[k]) || r.per100[k] < 0) return `bad per100.${k}`;
  return null;
}

const rows = new Map();
let rejected = 0;
for (const f of files) {
  const data = JSON.parse(readFileSync(f, "utf8"));
  let n = 0;
  for (const r of data) {
    const why = check(r);
    if (why) { rejected++; if (rejected <= 10) console.warn(`skip ${r?.id ?? "?"}: ${why}`); continue; }
    rows.set(r.id, {
      id: r.id, source: r.source, code: r.code, name: r.name.trim(),
      aliases: [...new Set((r.aliases ?? []).map((a) => String(a).trim()).filter(Boolean))].slice(0, 30),
      region: r.region ?? "GLOBAL", category: String(r.category ?? "").slice(0, 80), state: r.state ?? "unknown",
      per100: Object.fromEntries(KEYS.map((k) => [k, r.per100[k]])),
      portions: (r.portions ?? []).filter((p) => p && p.grams > 0 && p.grams <= 5000 && p.label).slice(0, 8),
      meta: r.meta ?? {},
    });
    n++;
  }
  console.log(`${f}: ${n} valid rows`);
}
console.log(`total ${rows.size} unique rows, ${rejected} rejected`);
if (dry) process.exit(0);

const env = loadEnv();
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) { console.error("Supabase env vars missing in .env.local"); process.exit(1); }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const all = [...rows.values()];
const BATCH = 400;
for (let i = 0; i < all.length; i += BATCH) {
  const { error } = await sb.from("reference_foods").upsert(all.slice(i, i + BATCH), { onConflict: "id" });
  if (error) { console.error(`batch at ${i} failed: ${error.message}`); process.exit(1); }
  process.stdout.write(`\rupserted ${Math.min(i + BATCH, all.length)}/${all.length}`);
}
console.log("\ndone");
