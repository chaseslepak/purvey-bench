"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseSalesReport } from "@/lib/deal/report";
import { processOutbox } from "@/lib/email/send";
import { verifyStoredUpload } from "@/lib/files";
import { getSession } from "@/lib/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuid = z.uuid();
const STAGES = ["targeted", "pitched", "samples_sent", "category_review", "authorized", "on_shelf"] as const;
type R = { ok?: boolean; error?: string; message?: string };

async function ctx(conversationId: string) {
  const s = await getSession();
  if (!s?.org) throw new Error("Sign in required.");
  const db = await createClient();
  const { data: c } = await db.from("conversations").select("id, brand_org_id, broker_org_id, declined_at").eq("id", uuid.parse(conversationId)).single();
  if (!c) throw new Error("Conversation not found.");
  return { s, db, c, isBroker: c.broker_org_id === s.org.id, isBrand: c.brand_org_id === s.org.id };
}
const flush = () => after(async () => { try { await processOutbox(20); } catch { /* cron retries */ } });
const done = (id: string, tab: string) => revalidatePath(`/app/inbox/${id}/${tab}`);

// ----- Progress -----
export async function addAccount(conversationId: string, input: { retailerId?: number | null; customName?: string | null; stores?: number | null }): Promise<R> {
  const { db, c, isBroker } = await ctx(conversationId);
  if (!isBroker) return { error: "Only the broker manages accounts." };
  const p = z.object({ retailerId: z.number().int().positive().nullish(), customName: z.string().trim().min(1).max(120).nullish(), stores: z.number().int().min(0).max(100000).nullish() }).safeParse(input);
  if (!p.success || (!p.data.retailerId && !p.data.customName)) return { error: "Choose a retailer." };
  const { error } = await db.from("deal_accounts").insert({ conversation_id: c.id, retailer_id: p.data.retailerId ?? null, custom_name: p.data.retailerId ? null : p.data.customName, stores: p.data.stores ?? null });
  if (error) return { error: /duplicate/.test(error.message) ? "That account is already on the board." : "Couldn't add the account." };
  done(c.id, "progress");
  return { ok: true };
}

export async function postUpdate(conversationId: string, input: { accountId: string; toStage: string; note: string; nextStep?: string; due?: string }): Promise<R> {
  const { s, db, c, isBroker } = await ctx(conversationId);
  if (!isBroker) return { error: "Only the broker posts progress updates." };
  const p = z.object({
    accountId: uuid, toStage: z.enum(STAGES), note: z.string().trim().min(1, "Say what happened.").max(4000),
    nextStep: z.string().trim().max(300).optional(), due: z.union([z.literal(""), z.iso.date()]).optional(),
  }).safeParse(input);
  if (!p.success) return { error: p.error.issues[0].message };
  const { error } = await db.from("deal_updates").insert({
    conversation_id: c.id, account_id: p.data.accountId, author_user_id: s.userId, to_stage: p.data.toStage,
    note: p.data.note, next_step: p.data.nextStep || null, due_date: p.data.due || null,
  });
  if (error) return { error: "Couldn't post the update." };
  flush();
  done(c.id, "progress");
  return { ok: true, message: "Update posted. The brand can see it now." };
}

export async function toggleThanks(conversationId: string, updateId: string): Promise<R> {
  const { s, db, c, isBrand } = await ctx(conversationId);
  if (!isBrand) return { error: "Only the brand can say thanks." };
  const id = uuid.parse(updateId);
  const { data: existing } = await db.from("deal_update_thanks").select("update_id").eq("update_id", id).eq("org_id", s.org!.id).maybeSingle();
  if (existing) await db.from("deal_update_thanks").delete().eq("update_id", id).eq("org_id", s.org!.id);
  else await db.from("deal_update_thanks").insert({ update_id: id, org_id: s.org!.id, user_id: s.userId });
  done(c.id, "progress");
  return { ok: true };
}

export async function setAccount(conversationId: string, accountId: string, patch: { covered?: boolean; stores?: number | null }): Promise<R> {
  const { db, c, isBroker } = await ctx(conversationId);
  if (!isBroker) return { error: "Only the broker manages accounts." };
  const p = z.object({ covered: z.boolean().optional(), stores: z.number().int().min(0).max(100000).nullable().optional() }).safeParse(patch);
  if (!p.success) return { error: "Invalid change." };
  const { error } = await db.from("deal_accounts").update(p.data).eq("id", uuid.parse(accountId)).eq("conversation_id", c.id);
  done(c.id, "progress");
  return error ? { error: "Couldn't update the account." } : { ok: true };
}

// ----- Toolbox -----
const FOLDERS = ["Sell sheets", "Decks", "Pricing", "Spec sheets", "Retail photos", "Reports", "Other"] as const;
const verifyUpload = (path: string, mime: string) => verifyStoredUpload("toolbox", path, mime);

export async function registerToolboxFile(conversationId: string, input: { path: string; name: string; mime: string; folder: string }): Promise<R> {
  const { s, db, c } = await ctx(conversationId);
  const p = z.object({ path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.[a-z0-9]{2,5}$/), name: z.string().trim().min(1).max(200), mime: z.string(), folder: z.enum(FOLDERS) }).safeParse(input);
  if (!p.success || !p.data.path.startsWith(`${c.id}/`)) return { error: "Invalid upload." };
  const v = await verifyUpload(p.data.path, p.data.mime);
  if (v.error) return { error: v.error };
  const { error } = await db.from("toolbox_files").insert({ conversation_id: c.id, org_id: s.org!.id, folder: p.data.folder, file_name: p.data.name, storage_path: p.data.path, mime_type: p.data.mime, size_bytes: v.bytes!.length, created_by: s.userId });
  if (error) { await createAdminClient().storage.from("toolbox").remove([p.data.path]); return { error: "Couldn't save the file." }; }
  done(c.id, "toolbox");
  return { ok: true };
}

export async function openToolboxFile(conversationId: string, fileId: string): Promise<{ url?: string; error?: string }> {
  const { db, c } = await ctx(conversationId);
  const { data: f } = await db.from("toolbox_files").select("storage_path, file_name").eq("id", uuid.parse(fileId)).eq("conversation_id", c.id).single();
  if (!f) return { error: "File not found." };
  await db.rpc("log_toolbox_open", { p_file: fileId });
  const { data } = await db.storage.from("toolbox").createSignedUrl(f.storage_path, 300, { download: f.file_name });
  return data?.signedUrl ? { url: data.signedUrl } : { error: "Couldn't open the file." };
}

export async function deleteToolboxFile(conversationId: string, fileId: string): Promise<R> {
  const { db, c } = await ctx(conversationId);
  const { data: f } = await db.from("toolbox_files").delete().eq("id", uuid.parse(fileId)).eq("conversation_id", c.id).select("storage_path").maybeSingle();
  if (!f) return { error: "Only the team that added a file can delete it." };
  await createAdminClient().storage.from("toolbox").remove([f.storage_path]);
  done(c.id, "toolbox");
  return { ok: true };
}

// ----- Commissions -----
export async function saveTerms(conversationId: string, input: { rate: string; retainer: string; retainerFrom: string; retainerTo: string; dueDays: string; notes: string }): Promise<R> {
  const { s, db, c, isBroker } = await ctx(conversationId);
  if (!isBroker) return { error: "The broker records the agreed terms." };
  const p = z.object({
    rate: z.coerce.number().min(0).max(100), retainer: z.coerce.number().min(0).max(1_000_000),
    retainerFrom: z.union([z.literal(""), z.iso.date()]), retainerTo: z.union([z.literal(""), z.iso.date()]),
    dueDays: z.coerce.number().int().min(0).max(120), notes: z.string().trim().max(2000),
  }).safeParse(input);
  if (!p.success) return { error: "Check the rate, retainer and dates." };
  const { error } = await db.from("deal_terms").upsert({
    conversation_id: c.id, rate: p.data.rate, retainer: p.data.retainer, retainer_from: p.data.retainerFrom || null, retainer_to: p.data.retainerTo || null,
    invoice_due_days: p.data.dueDays, notes: p.data.notes || null, updated_by: s.userId, updated_at: new Date().toISOString(),
  });
  done(c.id, "commissions");
  return error ? { error: "Couldn't save the terms." } : { ok: true, message: "Terms saved." };
}

export async function uploadSalesReport(conversationId: string, input: { month: string; path: string; name: string; mime: string; distributor: string }): Promise<R> {
  const { s, db, c, isBrand } = await ctx(conversationId);
  if (!isBrand) return { error: "Only the brand uploads sales reports." };
  const p = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.csv$/), name: z.string().trim().min(1).max(200), mime: z.string(), distributor: z.string().trim().min(1).max(60) }).safeParse(input);
  if (!p.success || !p.data.path.startsWith(`${c.id}/`)) return { error: "Upload the report as a CSV file. In UNFI or KeHE, export the sales report to CSV." };
  const v = await verifyUpload(p.data.path, "text/csv");
  if (v.error) return { error: v.error };
  const { data: accounts } = await db.from("deal_accounts").select("custom_name, covered, retailers(name)").eq("conversation_id", c.id);
  const covered = (accounts ?? []).filter((a) => a.covered).map((a) => a.custom_name ?? (a.retailers as unknown as { name: string } | null)?.name ?? "").filter(Boolean);
  const parsed = parseSalesReport(new TextDecoder().decode(v.bytes), { defaultDistributor: p.data.distributor, coveredAccounts: covered });
  if (!parsed.lines.length) { await createAdminClient().storage.from("toolbox").remove([p.data.path]); return { error: parsed.warnings[0] ?? "Couldn't read any sales lines from that file." }; }
  // Keep the original in the toolbox so the broker can open it.
  await db.from("toolbox_files").insert({ conversation_id: c.id, org_id: s.org!.id, folder: "Reports", file_name: p.data.name, storage_path: p.data.path, mime_type: "text/csv", size_bytes: v.bytes!.length, created_by: s.userId });
  const { error } = await db.rpc("true_up_upload_report", { p_conv: c.id, p_period: `${p.data.month}-01`, p_path: p.data.path, p_name: p.data.name, p_lines: parsed.lines });
  if (error) return { error: /already invoiced/.test(error.message) ? "That month is already invoiced." : "Couldn't save the report." };
  flush();
  done(c.id, "commissions");
  return { ok: true, message: `Read ${parsed.rows} rows into ${parsed.lines.length} accounts.${parsed.warnings.length ? " " + parsed.warnings.join(" ") : ""}` };
}

const lineSchema = z.object({ account: z.string().min(1), distributor: z.string(), units: z.number(), gross: z.number(), deductions: z.number(), covered: z.boolean() });
export async function editTrueUp(conversationId: string, periodId: string, lines: unknown, adjustments: unknown): Promise<R> {
  const { db, c, isBroker } = await ctx(conversationId);
  if (!isBroker) return { error: "Only the broker edits the true-up." };
  const p = z.object({ lines: z.array(lineSchema).max(2000), adjustments: z.array(z.object({ label: z.string().trim().min(1).max(120), amount: z.number().min(-1e7).max(1e7) })).max(50) }).safeParse({ lines, adjustments });
  if (!p.success) return { error: "Check the adjustments." };
  const { error } = await db.rpc("true_up_edit", { p_period: uuid.parse(periodId), p_lines: p.data.lines, p_adjustments: p.data.adjustments });
  done(c.id, "commissions");
  return error ? { error: /can't be changed/.test(error.message) ? "Sales figures come from the brand's report and can't be changed." : "Couldn't save." } : { ok: true };
}

export async function issueInvoice(conversationId: string, periodId: string): Promise<R> {
  const { db, c } = await ctx(conversationId);
  const { data, error } = await db.rpc("true_up_invoice", { p_period: uuid.parse(periodId) });
  if (error) return { error: /only the broker/.test(error.message) ? "Only the broker invoices." : "Couldn't create the invoice." };
  flush();
  done(c.id, "commissions");
  return { ok: true, message: `Invoice ${data} sent.` };
}

export async function questionInvoice(conversationId: string, periodId: string, note: string): Promise<R> {
  const { db, c } = await ctx(conversationId);
  const { error } = await db.rpc("true_up_question", { p_period: uuid.parse(periodId), p_note: z.string().trim().min(1, "Say what's wrong.").max(1000).parse(note) });
  if (error) return { error: "Couldn't send your question." };
  flush();
  done(c.id, "commissions");
  return { ok: true, message: "The broker will see your question." };
}

export async function markPaid(conversationId: string, periodId: string, input: { date: string; method: string; ref: string }): Promise<R> {
  const { db, c } = await ctx(conversationId);
  const p = z.object({ date: z.iso.date(), method: z.enum(["ACH", "Check", "Wire", "Other"]), ref: z.string().trim().max(80) }).safeParse(input);
  if (!p.success) return { error: "Enter the payment date and method." };
  const { error } = await db.rpc("true_up_mark_paid", { p_period: uuid.parse(periodId), p_date: p.data.date, p_method: p.data.method, p_ref: p.data.ref });
  if (error) return { error: "Couldn't record the payment." };
  flush();
  done(c.id, "commissions");
  return { ok: true, message: "Marked paid. The broker has been notified." };
}

/** "Have Purvey audit commissions": a Purvey service. Bench only records the request. */
export async function requestCommissionAudit(conversationId: string, note: string): Promise<R> {
  const { db, c } = await ctx(conversationId);
  const id = c.id;
  const n = z.string().trim().max(4000).safeParse(note);
  if (!n.success) return { error: "Keep the note under 4,000 characters." };
  const { error } = await db.rpc("request_commission_audit", { p_conv: id, p_note: n.data });
  if (error) return { error: "Couldn't send the request." };
  flush(); done(id, "commissions");
  return { ok: true };
}
