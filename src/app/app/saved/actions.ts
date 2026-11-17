"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export async function updateSaved(id: string, patch: { folder?: string; note?: string }): Promise<{ ok: boolean }> {
  const s = await getSession();
  if (s?.org?.type !== "brand") return { ok: false };
  const p = z.object({ folder: z.string().trim().max(80).optional(), note: z.string().trim().max(4000).optional() }).safeParse(patch);
  if (!p.success) return { ok: false };
  const db = await createClient();
  const update: Record<string, string | null> = {};
  if (p.data.folder !== undefined) update.folder = p.data.folder || null;
  if (p.data.note !== undefined) update.note = p.data.note || null;
  const { error } = await db.from("saved_brokers").update(update).eq("id", z.uuid().parse(id));
  revalidatePath("/app/saved");
  return { ok: !error };
}

export async function updateSavedSearch(id: string, patch: { name?: string; alerts?: boolean }): Promise<{ ok: boolean }> {
  const s = await getSession();
  if (s?.org?.type !== "brand") return { ok: false };
  const p = z.object({ name: z.string().trim().min(1).max(80).optional(), alerts: z.boolean().optional() }).safeParse(patch);
  if (!p.success) return { ok: false };
  const db = await createClient();
  const { error } = await db.from("saved_searches").update(p.data).eq("id", z.uuid().parse(id));
  revalidatePath("/app/saved");
  return { ok: !error };
}

export async function deleteSavedSearch(id: string): Promise<{ ok: boolean }> {
  const s = await getSession();
  if (s?.org?.type !== "brand") return { ok: false };
  const db = await createClient();
  const { error } = await db.from("saved_searches").delete().eq("id", z.uuid().parse(id));
  revalidatePath("/app/saved");
  return { ok: !error };
}
