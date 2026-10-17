import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Service-role client: only for the shared food cache and usage counters. Never for user-scoped reads. */
export function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
