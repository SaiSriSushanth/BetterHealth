import "server-only";
import { getSupabaseAdmin } from "../supabase/admin";
import { webCode, type WebRow } from "./web";
import { parseRefRows } from "./parse";
import type { RefFood } from "./types";

/** search_reference_foods via the service role. Any failure yields no rows so later stages take over. */
export async function searchReference(term: string, regions: string[]): Promise<RefFood[]> {
  const q = term.trim().slice(0, 100);
  if (!q) return [];
  const admin = getSupabaseAdmin();
  if (!admin) return [];
  try {
    const { data, error } = await admin.rpc("search_reference_foods", { q, regions, lim: 6 });
    return error ? [] : parseRefRows(data);
  } catch {
    return [];
  }
}

/** Writes a validated web row so the next lookup is a plain DB hit. */
export async function saveWebRow(row: WebRow): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  await admin.from("reference_foods").upsert(
    {
      id: row.id, source: "web", code: webCode(row.meta.query), name: row.name, aliases: row.aliases, region: row.region,
      category: row.category, state: row.state, per100: row.per100, portions: row.portions, meta: row.meta,
    },
    { onConflict: "id" },
  );
}
