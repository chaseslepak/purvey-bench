"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin, PIPELINE } from "@/lib/admin";
import { processOutbox } from "@/lib/email/send";

const uuid = z.uuid();
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
/** Admin actions are plain forms: do the work, then come back with a notice. */
function back(path: string, msg: { ok?: string; err?: string }): never {
  revalidatePath(path.split("?")[0]);
  const q = new URLSearchParams(msg as Record<string, string>).toString();
  redirect(`${path}${path.includes("?") ? "&" : "?"}${q}`);
}
const flushEmails = () => after(async () => { try { await processOutbox(20); } catch { /* cron retries */ } });
const friendly = (m: string) => m.replace(/^.*?:\s*/, "").replace(/^\w/, (c) => c.toUpperCase());

/* ---------- Listings ---------- */
export async function setPaused(f: FormData) {
  const { db } = await requireAdmin();
  const id = uuid.parse(str(f, "listingId")), paused = str(f, "paused") === "1", reason = str(f, "reason") || null;
  const to = str(f, "back") || "/admin/listings";
  if (paused && !reason) back(to, { err: "Give a reason for pausing. The broker sees it." });
  const { error } = await db.rpc("admin_pause_listing", { p_listing: id, p_paused: paused, p_reason: reason });
  if (error) back(to, { err: friendly(error.message) });
  flushEmails();
  back(to, { ok: paused ? "Listing paused. The broker was emailed." : "Listing unpaused." });
}

export async function setComped(f: FormData) {
  const { db } = await requireAdmin();
  const org = uuid.parse(str(f, "orgId")), comped = str(f, "comped") === "1";
  const to = str(f, "back") || "/admin/listings";
  const { data, error } = await db.rpc("admin_set_comp", { p_org: org, p_comped: comped });
  if (error) back(to, { err: friendly(error.message) });
  flushEmails();
  back(to, { ok: comped ? `Comped. Listing is now ${data}.` : `Comp removed. Listing is now ${data}.` });
}

export async function setSuspended(f: FormData) {
  const { db } = await requireAdmin();
  const org = uuid.parse(str(f, "orgId")), suspended = str(f, "suspended") === "1";
  const to = str(f, "back") || "/admin/brands";
  const { error } = await db.rpc("admin_suspend_org", { p_org: org, p_suspended: suspended });
  if (error) back(to, { err: friendly(error.message) });
  back(to, { ok: suspended ? "Organization suspended." : "Suspension lifted." });
}

const listingEdit = z.object({
  about: z.string().trim().max(2000),
  hq_city: z.string().trim().max(80),
  hq_state: z.string().trim().regex(/^([A-Z]{2})?$/, "State is two letters"),
  name: z.string().trim().min(2).max(120),
});
export async function editListing(f: FormData) {
  const { db } = await requireAdmin();
  const listingId = uuid.parse(str(f, "listingId")), orgId = uuid.parse(str(f, "orgId"));
  const to = `/admin/listings/${listingId}`;
  const p = listingEdit.safeParse({ about: str(f, "about"), hq_city: str(f, "hq_city"), hq_state: str(f, "hq_state").toUpperCase(), name: str(f, "name") });
  if (!p.success) back(to, { err: p.error.issues[0].message });
  const [a, b] = await Promise.all([
    db.from("broker_listings").update({ about: p.data.about || null }).eq("id", listingId),
    db.from("organizations").update({ name: p.data.name, hq_city: p.data.hq_city || null, hq_state: p.data.hq_state || null }).eq("id", orgId),
  ]);
  if (a.error || b.error) back(to, { err: "Couldn't save the changes." });
  await db.rpc("admin_log", { p_action: "listing.admin_edit", p_target_type: "listing", p_target_id: listingId, p_details: p.data });
  back(to, { ok: "Saved." });
}

/* ---------- Verification ---------- */
export async function saveChecklist(f: FormData) {
  const { db } = await requireAdmin();
  const id = uuid.parse(str(f, "verificationId"));
  const to = `/admin/verification/${id}`;
  const { error } = await db.rpc("admin_update_verification_review", {
    p_verification: id, p_references_reached: f.get("references_reached") === "on", p_retailers_confirmed: f.get("retailers_confirmed") === "on", p_notes: str(f, "notes") || null,
  });
  if (error) back(to, { err: friendly(error.message) });
  back(to, { ok: "Checklist saved." });
}

export async function updateReference(f: FormData) {
  const { db } = await requireAdmin();
  const to = str(f, "back");
  const status = z.enum(["pending", "reached", "confirmed", "unreachable"]).parse(str(f, "status"));
  const { error } = await db.rpc("admin_update_reference", { p_ref: uuid.parse(str(f, "refId")), p_status: status, p_notes: str(f, "notes") });
  if (error) back(to, { err: friendly(error.message) });
  back(to, { ok: "Reference updated." });
}

export async function decideVerification(f: FormData) {
  const { db } = await requireAdmin();
  const id = uuid.parse(str(f, "verificationId"));
  const to = str(f, "back") || `/admin/verification/${id}`;
  const status = z.enum(["verified", "rejected", "revoked"]).parse(str(f, "decision"));
  const { error } = await db.rpc("admin_decide_verification", { p_verification: id, p_status: status, p_reason: str(f, "reason") || null });
  if (error) back(to, { err: friendly(error.message) });
  flushEmails();
  back(to, { ok: status === "verified" ? "Verified. The broker was emailed." : status === "rejected" ? "Rejected. The broker was emailed the reason." : "Badge revoked. The broker was emailed the reason." });
}

/* ---------- Requests (placements and commission audits) ---------- */
export async function setRequestStatus(f: FormData) {
  const { db } = await requireAdmin();
  const kind = z.enum(["placement", "audit"]).parse(str(f, "kind"));
  const id = uuid.parse(str(f, "id"));
  const status = z.enum(PIPELINE).parse(str(f, "status"));
  const table = kind === "placement" ? "placement_requests" : "audit_requests";
  const { error } = await db.from(table).update({ status }).eq("id", id);
  if (error) back("/admin/requests", { err: "Couldn't update the request." });
  await db.rpc("admin_log", { p_action: `${kind}.status`, p_target_type: table, p_target_id: id, p_details: { to: status } });
  back("/admin/requests", { ok: `Moved to ${status}.` });
}

/* ---------- Reports ---------- */
export async function resolveReport(f: FormData) {
  const { db } = await requireAdmin();
  const id = uuid.parse(str(f, "reportId"));
  const status = z.enum(["resolved", "dismissed"]).parse(str(f, "status"));
  const action = z.enum(["none", "warn", "block", "pause", "suspend"]).parse(str(f, "action") || "none");
  const { error } = await db.rpc("admin_resolve_report", { p_report: id, p_status: status, p_resolution: str(f, "resolution"), p_action: action, p_message: str(f, "message") || null });
  if (error) back(`/admin/reports/${id}`, { err: friendly(error.message) });
  flushEmails();
  back("/admin/reports", { ok: status === "dismissed" ? "Report dismissed." : "Report resolved." });
}

/* ---------- Reference lists ---------- */
const LISTS = ["retailers", "categories", "channels", "distributors"] as const;
const slugify = (s: string) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export async function addListItem(f: FormData) {
  const { db } = await requireAdmin();
  const list = z.enum(LISTS).parse(str(f, "list"));
  const to = `/admin/lists?list=${list}`;
  const name = str(f, "name");
  if (name.length < 2 || name.length > 120) back(to, { err: "Name must be 2 to 120 characters." });
  const row: Record<string, unknown> = { name, slug: slugify(name) };
  const { data, error } = await db.from(list).insert(row).select("id").single();
  if (error) back(to, { err: /duplicate/.test(error.message) ? "That name is already on the list." : friendly(error.message) });
  await db.rpc("admin_log", { p_action: "reference.add", p_target_type: list, p_target_id: String(data!.id), p_details: { name } });
  back(to, { ok: `Added ${name}.` });
}

export async function renameListItem(f: FormData) {
  const { db } = await requireAdmin();
  const list = z.enum(LISTS).parse(str(f, "list"));
  const to = `/admin/lists?list=${list}`;
  const id = z.coerce.number().int().positive().parse(str(f, "id"));
  const name = str(f, "name");
  if (name.length < 2 || name.length > 120) back(to, { err: "Name must be 2 to 120 characters." });
  const { error } = await db.from(list).update({ name }).eq("id", id);
  if (error) back(to, { err: /duplicate/.test(error.message) ? "That name is already on the list." : friendly(error.message) });
  await db.rpc("admin_log", { p_action: "reference.rename", p_target_type: list, p_target_id: String(id), p_details: { name } });
  back(to, { ok: `Renamed to ${name}.` });
}

export async function mergeListItem(f: FormData) {
  const { db } = await requireAdmin();
  const list = z.enum(LISTS).parse(str(f, "list"));
  const to = `/admin/lists?list=${list}`;
  const from = z.coerce.number().int().positive().parse(str(f, "from"));
  const into = z.coerce.number().int().positive().safeParse(str(f, "into"));
  if (!into.success) back(to, { err: "Choose what to merge into." });
  const { error } = await db.rpc("admin_merge_reference", { p_table: list, p_from: from, p_into: into.data });
  if (error) back(to, { err: friendly(error.message) });
  back(to, { ok: "Merged. Listings, briefs and brand profiles now point to the kept item." });
}
