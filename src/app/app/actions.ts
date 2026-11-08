"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { APP_URL } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

export type FormState = { error?: string; fieldErrors?: Record<string, string>; ok?: string } | undefined;

function fieldErrors(error: z.ZodError) {
  const out: Record<string, string> = {};
  for (const i of error.issues) out[String(i.path[0])] ??= i.message;
  return out;
}

const onboardingSchema = z.object({
  type: z.enum(["brand", "broker"], { message: "Choose brand or broker." }),
  name: z.string().trim().min(1, "Enter your name.").max(120),
  orgName: z.string().trim().min(1, "Enter your company name.").max(120),
  website: z
    .string()
    .trim()
    .max(200)
    .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
    .pipe(z.union([z.literal(""), z.url("Enter a valid website.")]))
    .optional(),
  hqCity: z.string().trim().max(80).optional(),
  hqState: z.string().trim().toUpperCase().regex(/^([A-Z]{2})?$/, "Choose a state.").optional(),
});

export async function completeOnboarding(_prev: FormState, form: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  if (session.org) redirect("/app");

  const parsed = onboardingSchema.safeParse({
    type: form.get("type"),
    name: form.get("name"),
    orgName: form.get("orgName"),
    website: form.get("website") ?? "",
    hqCity: form.get("hqCity") ?? "",
    hqState: form.get("hqState") ?? "",
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization", {
    p_type: parsed.data.type,
    p_name: parsed.data.orgName,
    p_website: parsed.data.website || null,
    p_hq_city: parsed.data.hqCity || null,
    p_hq_state: parsed.data.hqState || null,
    p_user_name: parsed.data.name,
  });
  if (error) return { error: error.message.includes("already belong") ? "You already belong to an organization." : "Something went wrong. Please try again." };

  redirect(parsed.data.type === "broker" ? "/app?welcome=broker" : "/app?welcome=brand");
}

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  role: z.enum(["owner", "member"]),
});

export async function inviteTeammate(_prev: FormState, form: FormData): Promise<FormState> {
  const session = await getSession();
  if (!session?.org || session.org.memberRole !== "owner") return { error: "Only owners can invite teammates." };
  const parsed = inviteSchema.safeParse({ email: form.get("email"), role: form.get("role") ?? "member" });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: token, error } = await supabase.rpc("create_invite", { p_email: parsed.data.email, p_role: parsed.data.role });
  if (error) return { error: error.message.includes("already a teammate") ? "That person is already on your team." : "Couldn't create the invite." };
  revalidatePath("/app/team");
  // Phase 4 sends this by email through Resend; until then the owner shares it.
  return { ok: `${APP_URL}/invite/${token}` };
}

export async function removeTeammate(form: FormData) {
  const userId = z.uuid().parse(form.get("userId"));
  const supabase = await createClient();
  await supabase.rpc("remove_member", { p_user: userId });
  revalidatePath("/app/team");
}

export async function revokeInvite(form: FormData) {
  const id = z.uuid().parse(form.get("inviteId"));
  const supabase = await createClient();
  await supabase.rpc("revoke_invite", { p_invite: id });
  revalidatePath("/app/team");
}

export async function acceptInvite(form: FormData) {
  const token = z.string().regex(/^[a-f0-9]{64}$/).parse(form.get("token"));
  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_invite", { p_token: token });
  if (error) {
    const code = /different email/.test(error.message) ? "email" : /already belong/.test(error.message) ? "member" : /type|organization/.test(error.message) && /invite is for/.test(error.message) ? "type" : "invalid";
    redirect(`/invite/${token}?error=${code}`);
  }
  redirect("/app");
}
