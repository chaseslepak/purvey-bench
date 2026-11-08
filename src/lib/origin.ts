import "server-only";
import { headers } from "next/headers";
import { APP_URL } from "@/lib/site";

/**
 * The origin this request was served from (production domain, a Vercel
 * preview, or localhost). Used for sign-in and OAuth return links so they
 * come back to the same deployment. Supabase only accepts origins on its
 * redirect allow-list, so a forged Host header can't redirect elsewhere.
 */
export async function requestOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return APP_URL;
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
