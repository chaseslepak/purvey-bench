import "server-only";
import { stripe, stripeConfigured } from "@/lib/billing/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/** The annual plan (25% off) is an early-access deal for the first brokerages only. */
export const EARLY_ACCESS_SPOTS = 12;

/**
 * Spots left: 12 minus brokerages holding one. A spot is held by an annual
 * subscription (in any state but an abandoned checkout, so a later
 * cancellation doesn't reopen it) and, while it's open, by an annual
 * checkout (they expire after 31 minutes). On any error, report none left.
 */
export async function earlyAccessLeft(): Promise<number> {
  try {
    const { data, error } = await createAdminClient()
      .from("subscriptions")
      .select("org_id")
      .eq("plan", "annual")
      .not("status", "in", "(incomplete,incomplete_expired)");
    if (error) return 0;
    const held = new Set((data ?? []).map((r) => r.org_id as string));
    if (stripeConfigured()) {
      for await (const cs of stripe().checkout.sessions.list({ status: "open", limit: 100 })) {
        if (cs.metadata?.plan === "annual" && cs.metadata.org_id) held.add(cs.metadata.org_id);
      }
    }
    return Math.max(0, EARLY_ACCESS_SPOTS - held.size);
  } catch {
    return 0;
  }
}
