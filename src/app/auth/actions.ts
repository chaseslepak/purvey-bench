"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { supabaseConfigured } from "@/lib/env";
import { safeNext } from "@/lib/redirect";
import { requestOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import { verifyTurnstile } from "@/lib/turnstile";

export type AuthFormState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

const email = z.string().trim().toLowerCase().email("Enter a valid email address.");

async function confirmUrl(next: string) {
  return `${await requestOrigin()}/auth/confirm?next=${encodeURIComponent(next)}`;
}

function notConfigured(): AuthFormState {
  return { error: "Sign-in isn't configured in this environment yet (Supabase keys are missing)." };
}

export async function sendSignInLink(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = z.object({ email, next: z.string().optional() }).safeParse({
    email: form.get("email"),
    next: form.get("next") ?? undefined,
  });
  if (!parsed.success) return { fieldErrors: { email: parsed.error.issues[0].message } };
  if (!supabaseConfigured()) return notConfigured();

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    // Sign-in never creates accounts; new people go through /sign-up.
    options: { shouldCreateUser: false, emailRedirectTo: await confirmUrl(safeNext(parsed.data.next)) },
  });
  // Don't reveal whether an account exists.
  if (error && !/signups not allowed|user not found/i.test(error.message)) {
    return { error: "We couldn't send the link. Please try again in a minute." };
  }
  redirect(`/auth/check-email?email=${encodeURIComponent(parsed.data.email)}`);
}

const signUpSchema = z.object({
  role: z.enum(["brand", "broker"], { message: "Choose brand or broker." }),
  name: z.string().trim().min(1, "Enter your name.").max(120),
  orgName: z.string().trim().min(1, "Enter your company name.").max(120),
  jobTitle: z.string().trim().max(120).optional(),
  email,
});

export async function signUp(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    role: form.get("role"),
    name: form.get("name"),
    orgName: form.get("orgName"),
    jobTitle: form.get("jobTitle") || undefined,
    email: form.get("email"),
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!(await verifyTurnstile(form.get("cf-turnstile-response") as string | null, ip))) {
    return { error: "Please complete the verification check and try again." };
  }
  if (!supabaseConfigured()) return notConfigured();

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: await confirmUrl("/app/onboarding"),
      // Prefills onboarding; the organization is created there by create_organization().
      data: {
        name: parsed.data.name,
        signup_role: parsed.data.role,
        signup_org_name: parsed.data.orgName,
        signup_job_title: parsed.data.jobTitle ?? null,
      },
    },
  });
  if (error) return { error: "We couldn't send the link. Please try again in a minute." };
  redirect(`/auth/check-email?email=${encodeURIComponent(parsed.data.email)}`);
}

/** Invitees: create (or sign in to) an account without creating an organization, then return to the invite. */
export async function sendInviteLink(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = z
    .object({ email, token: z.string().regex(/^[a-f0-9]{64}$/) })
    .safeParse({ email: form.get("email"), token: form.get("token") });
  if (!parsed.success) return { fieldErrors: { email: parsed.error.issues[0].message } };
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (!(await verifyTurnstile(form.get("cf-turnstile-response") as string | null, ip))) {
    return { error: "Please complete the verification check and try again." };
  }
  if (!supabaseConfigured()) return notConfigured();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data.email,
    options: { shouldCreateUser: true, emailRedirectTo: await confirmUrl(`/invite/${parsed.data.token}`) },
  });
  if (error) return { error: "We couldn't send the link. Please try again in a minute." };
  redirect(`/auth/check-email?email=${encodeURIComponent(parsed.data.email)}`);
}
