"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

/** Only Purvey addresses can become Bench admins. */
const PURVEY = /^[^@\s]+@purveycpg\.com$/i;

/** Add a Purvey teammate as an admin. They become one the next time they sign in (or at once, if they already have an account). */
export async function addAdmin(f: FormData) {
  const { s } = await requireAdmin();
  const email = String(f.get("email") ?? "").trim().toLowerCase();
  if (!PURVEY.test(email)) redirect(`/admin/team?err=${encodeURIComponent("Only @purveycpg.com addresses can be admins.")}`);
  const db = createAdminClient();
  const { error } = await db.from("admin_allowlist").upsert({ email }, { onConflict: "email", ignoreDuplicates: true });
  if (error) redirect(`/admin/team?err=${encodeURIComponent(`Couldn't add ${email}.`)}`);
  // An existing account is promoted at once (the allowlist trigger only runs on new rows).
  await db.from("users").update({ is_admin: true }).ilike("email", email);
  await db.from("product_events").insert({ name: "admin_added", user_id: s.userId, props: { email } });
  revalidatePath("/admin/team");
  redirect(`/admin/team?ok=${encodeURIComponent(`${email} is a Bench admin. They sign in at bench.purveycpg.com/sign-in with that email.`)}`);
}
