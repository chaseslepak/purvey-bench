import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Service-role client. Bypasses RLS, so it is used ONLY for things no user
 * may do themselves: Stripe webhook/billing sync, cron, and validating
 * uploads. Never import this from a Client Component.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  return createSupabaseClient(env.supabaseUrl, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
