"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

async function brand() {
  const s = await getSession();
  if (!s) return { error: "signin" as const };
  if (!s.org || s.org.type !== "brand") return { error: "brand-only" as const };
  return { s, db: await createClient() };
}

export async function toggleSave(listingId: string): Promise<{ saved?: boolean; error?: string }> {
  const ctx = await brand();
  if ("error" in ctx) return { error: ctx.error };
  const id = z.uuid().parse(listingId);
  const { data: existing } = await ctx.db.from("saved_brokers").select("id").eq("brand_org_id", ctx.s.org!.id).eq("listing_id", id).maybeSingle();
  if (existing) {
    await ctx.db.from("saved_brokers").delete().eq("id", existing.id);
    revalidatePath("/app/saved");
    return { saved: false };
  }
  const { error } = await ctx.db.from("saved_brokers").insert({ brand_org_id: ctx.s.org!.id, listing_id: id, created_by: ctx.s.userId });
  if (error) return { error: "Couldn't save. Try again." };
  revalidatePath("/app/saved");
  return { saved: true };
}

export type Contact = { name: string | null; title: string | null; email: string | null; phone: string | null };
export async function revealContact(listingId: string): Promise<{ contact?: Contact; error?: string }> {
  const ctx = await brand();
  if ("error" in ctx) return { error: ctx.error };
  const { data, error } = await ctx.db.rpc("reveal_contact", { p_listing: z.uuid().parse(listingId) });
  if (error) return { error: /50 contact reveals/.test(error.message) ? "You've reached today's limit of 50 new contact reveals. It resets in 24 hours." : "Couldn't load contact details." };
  return { contact: (data as Contact[])[0] ?? { name: null, title: null, email: null, phone: null } };
}

export async function requestPlacement(listingId: string, note: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await brand();
  if ("error" in ctx) return { error: ctx.error };
  const parsed = z.object({ id: z.uuid(), note: z.string().trim().max(4000) }).safeParse({ id: listingId, note });
  if (!parsed.success) return { error: "Keep the note under 4,000 characters." };
  const { error } = await ctx.db.from("placement_requests").insert({ brand_org_id: ctx.s.org!.id, listing_id: parsed.data.id, note: parsed.data.note || null, created_by: ctx.s.userId });
  if (error) return { error: "Couldn't send the request." };
  // Phase 4 emails Purvey admins and confirms to the brand.
  return { ok: true };
}
