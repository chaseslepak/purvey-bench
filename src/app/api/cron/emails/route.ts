import { NextResponse, type NextRequest } from "next/server";
import { enqueueAdminDigest, enqueueSavedSearchAlerts, enqueueWeeklySummaries, processOutbox, sendDigests } from "@/lib/email/send";
import { getReference } from "@/lib/reference";
import { loadLiveListings } from "@/lib/search-data";

/**
 * Email cron (Vercel Cron, Authorization: Bearer $CRON_SECRET).
 *   ?job=sweep   send anything due that the immediate send missed (retries)
 *   ?job=daily   daily digests, plus the admin queue digest
 *   ?job=weekly  weekly broker summaries, plus saved-search alerts for brands
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const job = req.nextUrl.searchParams.get("job") ?? "sweep";
  if (job === "daily") { const admin = await enqueueAdminDigest(); return NextResponse.json({ admin, ...(await sendDigests()), ...(await processOutbox(200)) }); }
  if (job === "weekly") {
    const queued = await enqueueWeeklySummaries();
    const [all, ref] = await Promise.all([loadLiveListings(), getReference()]);
    const searchAlerts = await enqueueSavedSearchAlerts(all, ref);
    return NextResponse.json({ queued, searchAlerts, ...(await processOutbox(500)) });
  }
  return NextResponse.json(await processOutbox(200));
}
