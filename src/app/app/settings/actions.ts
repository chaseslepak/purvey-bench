"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export type Result = { ok?: string; error?: string } | undefined;

async function ctx() {
  const s = await getSession();
  if (!s?.org) throw new Error("Sign in required.");
  return { s, db: await createClient() };
}

export async function saveProfile(_: Result, form: FormData): Promise<Result> {
  const { s, db } = await ctx();
  const p = z.object({ name: z.string().trim().min(1, "Enter your name.").max(120), phone: z.string().trim().max(40) }).safeParse({ name: form.get("name"), phone: form.get("phone") ?? "" });
  if (!p.success) return { error: p.error.issues[0].message };
  const { error } = await db.from("users").update({ name: p.data.name, phone: p.data.phone || null }).eq("id", s.userId);
  revalidatePath("/app/settings");
  return error ? { error: "Couldn't save." } : { ok: "Saved." };
}

export async function saveNotifications(_: Result, form: FormData): Promise<Result> {
  const { s, db } = await ctx();
  const p = z.object({ freq: z.enum(["instant", "daily", "off"]), weekly: z.boolean() }).safeParse({ freq: form.get("freq"), weekly: form.get("weekly") === "on" });
  if (!p.success) return { error: "Choose how often." };
  const { data: cur } = await db.from("notification_prefs").select("email_opt_outs").eq("user_id", s.userId).maybeSingle();
  // Choosing a frequency again clears matching unsubscribe-link opt-outs.
  const outs = { ...((cur?.email_opt_outs as Record<string, boolean>) ?? {}) };
  if (p.data.freq !== "off") { delete outs.new_message; delete outs.new_conversation; delete outs.digest; }
  if (p.data.weekly) delete outs.weekly_summary;
  const { error } = await db.from("notification_prefs").upsert({ user_id: s.userId, email_new_message: p.data.freq, email_weekly_summary: p.data.weekly, email_opt_outs: outs });
  revalidatePath("/app/settings");
  return error ? { error: "Couldn't save." } : { ok: "Email settings saved." };
}

export async function saveTemplate(_: Result, form: FormData): Promise<Result> {
  const { s, db } = await ctx();
  const p = z.object({ title: z.string().trim().min(1, "Give it a title.").max(120), body: z.string().trim().min(1, "Write the reply.").max(10000) }).safeParse({ title: form.get("title"), body: form.get("body") });
  if (!p.success) return { error: p.error.issues[0].message };
  const { error } = await db.from("message_templates").insert({ org_id: s.org!.id, title: p.data.title, body: p.data.body, created_by: s.userId });
  revalidatePath("/app/settings");
  return error ? { error: "Couldn't save." } : { ok: "Template saved." };
}

export async function deleteTemplate(form: FormData) {
  const { db } = await ctx();
  await db.from("message_templates").delete().eq("id", z.uuid().parse(form.get("id")));
  revalidatePath("/app/settings");
}

export async function saveAway(_: Result, form: FormData): Promise<Result> {
  const { s, db } = await ctx();
  if (s.org!.type !== "broker") return { error: "Away mode is for brokerages." };
  const p = z.object({ message: z.string().trim().max(1000), notTaking: z.boolean() }).safeParse({ message: form.get("message") ?? "", notTaking: form.get("notTaking") === "on" });
  if (!p.success) return { error: "Keep the auto-reply under 1,000 characters." };
  const { error } = await db.from("broker_listings").update({ away_message: p.data.message || null, not_taking_new_lines: p.data.notTaking }).eq("org_id", s.org!.id);
  revalidatePath("/app/settings");
  return error ? { error: "Couldn't save." } : { ok: p.data.message ? "Away mode on." : "Away mode saved." };
}
