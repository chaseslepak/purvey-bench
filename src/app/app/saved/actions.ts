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
