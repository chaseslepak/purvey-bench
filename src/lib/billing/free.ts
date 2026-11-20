import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

import { FREE_LISTINGS } from "./free-flag";

export { FREE_LISTINGS };

/** Give a brokerage complimentary access (idempotent). Returns the access row. */
export async function ensureFreeAccess(orgId: string) {
  const db = createAdminClient();
  const { data } = await db.from("subscriptions").select("status, comped, current_period_end, plan").eq("org_id", orgId).maybeSingle();
  if (!FREE_LISTINGS || data?.comped) return data;
  const { error } = await db.from("subscriptions").upsert({ org_id: orgId, comped: true }, { onConflict: "org_id" });
  if (error) { console.warn("free listing: couldn't comp org", error.code); return data; }
  // A submitted or paused listing goes live now that access is in place.
  await db.rpc("sync_listing_status", { p_org: orgId });
  return { ...(data ?? { status: null, current_period_end: null, plan: null }), comped: true };
}
