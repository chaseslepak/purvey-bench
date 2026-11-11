"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

async function brand() {
  const s = await getSession();
  if (!s?.org || s.org.type !== "brand") throw new Error("Briefs are for brand teams.");
  return { s, db: await createClient() };
}

const ids = z.array(z.number().int().positive()).max(200);
const briefSchema = z.object({
  title: z.string().trim().min(1, "Give the brief a title.").max(140),
  categoryId: z.number().int().positive().nullable(),
  regions: z.array(z.string().regex(/^[a-z]{2,20}$/)).max(10),
  states: z.array(z.string().regex(/^[A-Z]{2}$/)).max(51),
  channels: ids,
  retailers: ids,
  distributors: ids,
  notes: z.string().trim().max(4000).transform((v) => v || null),
});
export type BriefInput = z.input<typeof briefSchema>;

export async function createBrief(form: FormData) {
  const { s, db } = await brand();
  const title = z.string().trim().min(1).max(140).catch("Untitled brief").parse(form.get("title"));
  const { data, error } = await db.from("briefs").insert({ brand_org_id: s.org!.id, title, created_by: s.userId }).select("id").single();
  if (error || !data) throw new Error("Couldn't create the brief.");
  redirect(`/app/briefs/${data.id}`);
}

export async function saveBrief(id: string, input: BriefInput): Promise<{ ok: boolean; error?: string }> {
  const { db } = await brand();
  const p = briefSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0].message };
  const b = p.data;
  const { error } = await db.from("briefs").update({
    title: b.title, category_id: b.categoryId, regions: b.regions, states: b.states, channels: b.channels,
    target_retailers: b.retailers, distributors: b.distributors, notes: b.notes,
  }).eq("id", z.uuid().parse(id));
  if (error) return { ok: false, error: "Couldn't save the brief." };
  revalidatePath(`/app/briefs/${id}`);
  return { ok: true };
}

export async function duplicateBrief(form: FormData) {
  const { s, db } = await brand();
  const id = z.uuid().parse(form.get("id"));
  const { data: b } = await db.from("briefs").select("*").eq("id", id).single();
  if (!b) throw new Error("Brief not found.");
  const { data, error } = await db.from("briefs").insert({
    brand_org_id: s.org!.id, title: `${b.title} (copy)`.slice(0, 140), category_id: b.category_id, regions: b.regions, states: b.states,
    channels: b.channels, target_retailers: b.target_retailers, distributors: b.distributors, notes: b.notes, created_by: s.userId,
  }).select("id").single();
  if (error || !data) throw new Error("Couldn't duplicate the brief.");
  redirect(`/app/briefs/${data.id}`);
}

export async function setArchived(form: FormData) {
  const { db } = await brand();
  const id = z.uuid().parse(form.get("id"));
  const archive = form.get("archive") === "1";
  await db.from("briefs").update({ archived_at: archive ? new Date().toISOString() : null }).eq("id", id);
  revalidatePath("/app/briefs");
  redirect("/app/briefs");
}
