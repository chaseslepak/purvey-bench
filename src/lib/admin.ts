import "server-only";
import { notFound } from "next/navigation";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Admin pages and actions use the signed-in admin's own Supabase client, so
 * every read and write still goes through RLS and the admin RPCs (which
 * write the audit log). Non-admins get a 404, not a hint that /admin exists.
 */
export async function requireAdmin() {
  const s = await getSession();
  if (!s?.isAdmin) notFound();
  return { s, db: await createClient() };
}

export const fmtDate = (d: string | null | undefined) => (d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");
export const fmtDateTime = (d: string | null | undefined) => (d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—");

export { toCsv } from "@/lib/csv";

export const PIPELINE = ["new", "contacted", "quoted", "won", "lost"] as const;
