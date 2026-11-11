"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { processOutbox } from "@/lib/email/send";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

type R = { ok?: boolean; error?: string };
const uuid = z.uuid();
const flush = () => after(async () => { try { await processOutbox(20); } catch { /* cron retries */ } });
const refresh = (slug: string) => { if (/^[a-z0-9-]{1,80}$/.test(slug)) revalidatePath(`/brokers/${slug}`); revalidatePath("/app/reviews"); };

const reviewSchema = z.object({
  rating: z.number().int().min(1, "Choose 1 to 5 stars.").max(5),
  title: z.string().trim().max(120),
  body: z.string().trim().min(20, "Write at least a couple of sentences (20+ characters).").max(4000),
  showName: z.boolean(),
  reference: z.object({ name: z.string().trim().min(1, "Add the reference contact's name.").max(120), email: z.union([z.literal(""), z.email("Enter a valid email.")]), phone: z.string().trim().max(40), note: z.string().trim().max(2000) }).nullable(),
});

export async function submitReview(listingId: string, slug: string, input: z.input<typeof reviewSchema>): Promise<R> {
  const s = await getSession();
  if (s?.org?.type !== "brand") return { error: "Only brands can review brokers." };
  const p = reviewSchema.safeParse(input);
  if (!p.success) return { error: p.error.issues[0].message };
  const db = await createClient();
  const { error } = await db.rpc("submit_review", { p_listing: uuid.parse(listingId), p_rating: p.data.rating, p_title: p.data.title, p_body: p.data.body, p_show_name: p.data.showName });
  if (error) return { error: /replied/.test(error.message) ? "You can review a broker once they've replied to you on Bench." : "Couldn't save your review." };
  if (p.data.reference) {
    const r = p.data.reference;
    const { error: e2 } = await db.rpc("submit_brand_reference", { p_listing: listingId, p_name: r.name, p_email: r.email, p_phone: r.phone, p_note: r.note });
    if (e2) return { error: "Your review is saved, but the reference didn't go through. Try again." };
  }
  flush(); refresh(slug);
  return { ok: true };
}

export async function deleteReview(listingId: string, slug: string): Promise<R> {
  const db = await createClient();
  const { error } = await db.rpc("delete_my_review", { p_listing: uuid.parse(listingId) });
  refresh(slug);
  return error ? { error: "Couldn't delete your review." } : { ok: true };
}

export async function respondToReview(reviewId: string, slug: string, text: string): Promise<R> {
  const t = z.string().trim().max(2000).safeParse(text);
  if (!t.success) return { error: "Keep your reply under 2,000 characters." };
  const db = await createClient();
  const { error } = await db.rpc("respond_to_review", { p_review: uuid.parse(reviewId), p_text: t.data });
  refresh(slug);
  return error ? { error: "Couldn't save your reply." } : { ok: true };
}

export async function flagReview(reviewId: string, slug: string, reason: string): Promise<R> {
  const t = z.string().trim().min(3, "Tell Purvey what's wrong.").max(1000).safeParse(reason);
  if (!t.success) return { error: t.error.issues[0].message };
  const db = await createClient();
  const { error } = await db.rpc("flag_review", { p_review: uuid.parse(reviewId), p_reason: t.data });
  flush(); refresh(slug);
  return error ? { error: "Couldn't flag the review." } : { ok: true };
}
