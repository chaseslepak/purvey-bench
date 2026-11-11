import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily: re-evaluate every non-draft listing so the 7-day past_due grace
 * period and cancel-at-period-end take effect without waiting for a webhook.
 * Vercel Cron sends Authorization: Bearer $CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const { data, error } = await createAdminClient().rpc("sync_all_listing_statuses");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ changed: data });
}
