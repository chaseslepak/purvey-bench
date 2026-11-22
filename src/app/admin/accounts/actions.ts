"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/admin";
import { accountSchema, addOwner, createAccount, sendWelcome, setOwnerPassword } from "@/lib/admin-accounts";
import { createAdminClient } from "@/lib/supabase/admin";

function back(msg: { ok?: string; err?: string }, path = "/admin/accounts"): never {
  revalidatePath("/admin/accounts"); revalidatePath("/admin/brands"); revalidatePath("/admin/listings");
  redirect(`${path}${path.includes("?") ? "&" : "?"}${new URLSearchParams(msg as Record<string, string>)}`);
}
const field = (f: FormData, k: string) => (f.get(k) == null ? undefined : String(f.get(k)));

/** Set up a brand or brokerage; optionally email the owner their sign-in link right away. */
export async function setUpAccount(f: FormData) {
  const { s } = await requireAdmin();
  const keys = ["type", "name", "website", "hqCity", "hqState", "ownerName", "ownerEmail", "ownerPhone", "about", "states", "retailers", "channels", "distributors", "categories", "publish", "send", "note"];
  const parsed = accountSchema.safeParse(Object.fromEntries(keys.map((k) => [k, field(f, k)])));
  if (!parsed.success) back({ err: parsed.error.issues[0].message });
  const input = parsed.data!;
  if (input.send && !input.ownerEmail) back({ err: "Add the owner's email to send them a sign-in link." });
  const r = await createAccount(input, s.userId);
  if ("error" in r) back({ err: r.error });
  let msg = `${input.name} is set up${input.ownerEmail ? ` with ${input.ownerEmail} as owner` : " (no owner yet)"}.`;
  if (input.send) {
    const w = await sendWelcome(r.orgId, { note: input.note, from: s.name });
    msg += "error" in w ? ` ${w.error}` : ` ${w.ok}`;
  } else if (input.ownerEmail) msg += " Nothing was sent yet.";
  if (r.notes.length) msg += ` ${r.notes.join(" ")}`;
  back({ ok: msg });
}

/** Email (or re-email) the owner their sign-in link. A new link replaces the old one. */
export async function sendLoginLink(f: FormData) {
  const { s } = await requireAdmin();
  const orgId = z.uuid().parse(String(f.get("orgId")));
  const r = await sendWelcome(orgId, { note: String(f.get("note") ?? "").trim().slice(0, 600) || null, from: s.name });
  back("error" in r ? { err: r.error } : { ok: r.ok }, String(f.get("back") || "/admin/accounts"));
}

/** Give an organization set up without an owner its owner, and optionally send the link. */
export async function setOwner(f: FormData) {
  const { s } = await requireAdmin();
  const orgId = z.uuid().parse(String(f.get("orgId")));
  const email = z.email("Enter a valid email.").safeParse(String(f.get("email") ?? "").trim().toLowerCase());
  if (!email.success) back({ err: email.error.issues[0].message });
  const name = String(f.get("name") ?? "").trim().slice(0, 120) || null;
  const db = createAdminClient();
  const { data: org } = await db.from("organizations").select("type, name").eq("id", orgId).single();
  if (!org) back({ err: "Organization not found." });
  const r = await addOwner(db, orgId, org!.type as "brand" | "broker", email.data!, name, null);
  if ("error" in r) back({ err: r.error });
  if (org!.type === "broker") {
    const { data: l } = await db.from("broker_listings").select("id").eq("org_id", orgId).single();
    if (l) await db.from("broker_contacts").update({ name, email: email.data }).eq("listing_id", l.id).is("email", null);
  }
  if (f.get("send") === "1") {
    const w = await sendWelcome(orgId, { from: s.name });
    back("error" in w ? { err: `Owner added, but ${w.error}` } : { ok: `Owner added. ${w.ok}` });
  }
  back({ ok: `${email.data} is now the owner of ${org!.name}. Nothing was sent yet.` });
}

/** Give the owner a temporary password to share directly. */
export async function setTempPassword(f: FormData) {
  await requireAdmin();
  const orgId = z.uuid().parse(String(f.get("orgId")));
  const r = await setOwnerPassword(orgId, String(f.get("password") ?? ""));
  back("error" in r ? { err: r.error } : { ok: r.ok });
}
