import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/** The annual plan (25% off) is an early-access deal for the first brokerages only. */
export const EARLY_ACCESS_SPOTS = 12;

/**
 * Spots left: 12 minus brokerages that have taken the annual plan. A spot is
 * taken once the subscription exists in any state but an abandoned checkout,
 * so a cancellation later doesn't reopen it.
 */
export async function earlyAccessLeft(): Promise<number> {
  try {
    const { count } = await createAdminClient()
      .from("subscriptions")
      .select("org_id", { count: "exact", head: true })
      .eq("plan", "annual")
      .not("status", "in", "(incomplete,incomplete_expired)");
    return Math.max(0, EARLY_ACCESS_SPOTS - (count ?? 0));
  } catch {
    return 0; // if we can't count, don't oversell
  }
}
