"use server";

import { headers } from "next/headers";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { processOutbox } from "@/lib/email/send";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/turnstile";

export type Attachment = { path: string; name: string; size: number; type: "application/pdf" | "image/png" | "image/jpeg" | "image/webp" };
const attachment = z.object({
  path: z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|png|jpg|webp)$/),
  name: z.string().trim().min(1).max(200),
  size: z.number().int().min(1).max(10 * 1024 * 1024),
  type: z.enum(["application/pdf", "image/png", "image/jpeg", "image/webp"]),
});
const body = z.string().trim().min(1, "Write a message.").max(10000);
const uuid = z.uuid();

async function ctx() {
  const s = await getSession();
  if (!s?.org) throw new Error("Sign in required.");
  return { s, db: await createClient() };
}
/** Send queued emails right after the response, without delaying the user. */
function flushEmails() {
  after(async () => { try { await processOutbox(20); } catch { /* the cron sweep retries */ } });
}

export async function startConversation(input: { brokerOrgId: string; body: string; briefId?: string | null; turnstile?: string | null }): Promise<{ id?: string; error?: string }> {
  const { s, db } = await ctx();
  if (s.org!.type !== "brand") return { error: "Only brands can start conversations." };
  const p = z.object({ brokerOrgId: uuid, body, briefId: uuid.nullable().optional() }).safeParse(input);
  if (!p.success) return { error: p.error.issues[0].message };
  // Turnstile on a brand's first-ever message.
  const { count } = await db.from("conversations").select("*", { count: "exact", head: true }).eq("brand_org_id", s.org!.id);
  if (!count) {
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
    if (!(await verifyTurnstile(input.turnstile, ip))) return { error: "Please complete the verification check and try again." };
  }
  const { data, error } = await db.rpc("start_conversation", { p_broker_org: p.data.brokerOrgId, p_body: p.data.body, p_brief: p.data.briefId ?? null });
  if (error) {
    const m = error.message;
    return { error: /25 new conversations/.test(m) ? "You've started 25 conversations today, the daily limit. Try again tomorrow." : /blocked/.test(m) ? "You can't message this broker." : /not available/.test(m) ? "This broker isn't currently listed." : "Couldn't send your message." };
  }
  flushEmails();
  revalidatePath("/app/inbox");
  return { id: data as string };
}

export async function sendMessage(conversationId: string, text: string, attachments: Attachment[] = []): Promise<{ ok?: boolean; error?: string }> {
  const { s, db } = await ctx();
  const p = z.object({ id: uuid, text: z.string().trim().max(10000), attachments: z.array(attachment).max(5) }).safeParse({ id: conversationId, text, attachments });
  if (!p.success) return { error: "Check the message and attachments." };
  if (!p.data.text && !p.data.attachments.length) return { error: "Write a message." };
  if (p.data.attachments.some((a) => !a.path.startsWith(`${p.data.id}/`))) return { error: "Invalid attachment." };
  // Each message emails the other team, so cap bursts: 30 messages per person per 10 minutes.
  const since = new Date(Date.now() - 10 * 60_000).toISOString();
  const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("sender_user_id", s.userId).gte("created_at", since);
  if ((count ?? 0) >= 30) return { error: "You're sending messages very quickly. Please wait a few minutes and try again." };
  const msg = p.data.text || `Shared ${p.data.attachments.length} file${p.data.attachments.length === 1 ? "" : "s"}`;
  const { error } = await db.from("messages").insert({ conversation_id: p.data.id, sender_user_id: s.userId, sender_org_id: s.org!.id, body: msg, attachments: p.data.attachments });
  if (error) return { error: /closed/.test(error.message) ? "This conversation is closed." : /blocked/.test(error.message) ? "Messaging is blocked between your organizations." : "Couldn't send your message." };
  flushEmails();
  return { ok: true };
}

export async function markRead(conversationId: string) {
  const { db } = await ctx();
  await db.rpc("mark_conversation_read", { p_conv: uuid.parse(conversationId) });
}

const sideFields = z.object({
  brand_stage: z.enum(["contacted", "talking", "agreement_sent", "signed", "passed"]).optional(),
  broker_stage: z.enum(["new", "replied", "in_discussion", "won", "lost", "declined"]).optional(),
  archived: z.boolean().optional(),
  muted: z.boolean().optional(),
  marked_unread: z.boolean().optional(),
  assignee_user_id: uuid.nullable().optional(),
});
export async function updateSide(conversationId: string, patch: z.infer<typeof sideFields>): Promise<{ ok?: boolean; error?: string }> {
  const { s, db } = await ctx();
  const p = sideFields.safeParse(patch);
  if (!p.success) return { error: "Invalid change." };
  const data = { ...p.data };
  if (s.org!.type === "brand") delete data.broker_stage; else delete data.brand_stage;
  const { error } = await db.from("conversation_sides").update(data).eq("conversation_id", uuid.parse(conversationId)).eq("org_id", s.org!.id);
  revalidatePath("/app/inbox");
  return error ? { error: "Couldn't update." } : { ok: true };
}

export async function declineConversation(conversationId: string, reason: string, note: string): Promise<{ ok?: boolean; error?: string }> {
  const { s, db } = await ctx();
  if (s.org!.type !== "broker") return { error: "Only the broker can decline." };
  const p = z.object({ id: uuid, reason: z.enum(["not_a_fit", "category_conflict", "not_taking_new_lines", "other"]), note: z.string().trim().max(1000) }).safeParse({ id: conversationId, reason, note });
  if (!p.success) return { error: "Choose a reason." };
  const { error } = await db.rpc("decline_conversation", { p_conv: p.data.id, p_reason: p.data.reason, p_note: p.data.note || null });
  if (error) return { error: "Couldn't decline." };
  flushEmails();
  revalidatePath(`/app/inbox/${p.data.id}`);
  return { ok: true };
}

export async function addNote(conversationId: string, text: string): Promise<{ ok?: boolean; error?: string }> {
  const { s, db } = await ctx();
  const p = z.object({ id: uuid, text: z.string().trim().min(1).max(4000) }).safeParse({ id: conversationId, text });
  if (!p.success) return { error: "Write a note." };
  const { error } = await db.from("conversation_notes").insert({ conversation_id: p.data.id, org_id: s.org!.id, author_user_id: s.userId, body: p.data.text });
  revalidatePath(`/app/inbox/${p.data.id}`);
  return error ? { error: "Couldn't save the note." } : { ok: true };
}

export async function deleteNote(noteId: string, conversationId: string) {
  const { db } = await ctx();
  await db.from("conversation_notes").delete().eq("id", uuid.parse(noteId));
  revalidatePath(`/app/inbox/${uuid.parse(conversationId)}`);
}

export async function reportConversation(conversationId: string, reason: string): Promise<{ ok?: boolean; error?: string }> {
  const { s, db } = await ctx();
  const p = z.object({ id: uuid, reason: z.string().trim().min(3, "Tell us what happened.").max(2000) }).safeParse({ id: conversationId, reason });
  if (!p.success) return { error: p.error.issues[0].message };
  const { error } = await db.from("reports").insert({ reporter_user_id: s.userId, reporter_org_id: s.org!.id, conversation_id: p.data.id, reason: p.data.reason });
  if (error) return { error: "Couldn't send the report." };
  flushEmails();
  return { ok: true };
}

export async function blockOrg(conversationId: string, otherOrgId: string): Promise<{ ok?: boolean; error?: string }> {
  const { s, db } = await ctx();
  const { error } = await db.from("org_blocks").insert({ blocker_org_id: s.org!.id, blocked_org_id: uuid.parse(otherOrgId), created_by: s.userId });
  if (error && !/duplicate/.test(error.message)) return { error: "Couldn't block." };
  await db.from("conversation_sides").update({ archived: true }).eq("conversation_id", uuid.parse(conversationId)).eq("org_id", s.org!.id);
  revalidatePath("/app/inbox");
  return { ok: true };
}

export async function unblockOrg(otherOrgId: string) {
  const { s, db } = await ctx();
  await db.from("org_blocks").delete().eq("blocker_org_id", s.org!.id).eq("blocked_org_id", uuid.parse(otherOrgId));
  revalidatePath("/app/inbox");
}

/** Short-lived link to an attachment; storage RLS allows only the two parties. */
export async function attachmentUrl(path: string): Promise<string | null> {
  const { db } = await ctx();
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|png|jpg|webp)$/.test(path)) return null;
  const { data } = await db.storage.from("message-files").createSignedUrl(path, 300);
  return data?.signedUrl ?? null;
}
