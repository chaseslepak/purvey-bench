import { NextResponse } from "next/server";
import { health } from "@/lib/health";

export const dynamic = "force-dynamic";

/** Uptime check for monitors and the post-deploy workflow. 200 when everything works, 503 otherwise. Never returns secrets. */
export async function GET() {
  const h = await health();
  return NextResponse.json(h, { status: h.ok ? 200 : 503, headers: { "cache-control": "no-store" } });
}
