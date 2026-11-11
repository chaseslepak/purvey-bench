import { NextResponse, type NextRequest } from "next/server";
import { enqueueWeeklySummaries, processOutbox, sendDigests } from "@/lib/email/send";

/**
 * Email cron (Vercel Cron, Authorization: Bearer $CRON_SECRET).
 *   ?job=sweep   send anything due that the immediate send missed (retries)
 *   ?job=daily   daily digests
 *   ?job=weekly  weekly broker summaries
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const job = req.nextUrl.searchParams.get("job") ?? "sweep";
  if (job === "daily") return NextResponse.json({ ...(await sendDigests()), ...(await processOutbox(200)) });
  if (job === "weekly") { const queued = await enqueueWeeklySummaries(); return NextResponse.json({ queued, ...(await processOutbox(500)) }); }
  return NextResponse.json(await processOutbox(200));
}
