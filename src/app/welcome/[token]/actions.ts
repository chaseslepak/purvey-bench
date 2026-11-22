"use server";

import { redirect } from "next/navigation";
import { redeemWelcome } from "@/lib/admin-accounts";

/** The button on the welcome page: retire the link and sign in (which also verifies the email). */
export async function claimAccount(f: FormData) {
  const token = String(f.get("token") ?? "");
  const r = await redeemWelcome(token);
  if ("error" in r) redirect(`/welcome/${encodeURIComponent(token)}?e=${r.error}`);
  redirect(r.url);
}
