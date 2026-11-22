"use server";

import { revalidatePath } from "next/cache";
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
/** Bench passwords: at least 8 characters (Supabase enforces the same minimum). */
const PASSWORD_MIN = 8;
const password = z.string().min(PASSWORD_MIN, `Use at least ${PASSWORD_MIN} characters.`).max(72, "Use 72 characters or fewer.");

/** Onboarding, carrying a same-site "next" so people land where they were headed. */
function onboardingPath(next: FormDataEntryValue | null) {
  const n = typeof next === "string" ? safeNext(next, "") : "";
  return n.startsWith("/") ? `/app/onboarding?next=${encodeURIComponent(n)}` : "/app/onboarding";
}

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
  redirect(`/auth/check-email?from=sign-in&email=${encodeURIComponent(parsed.data.email)}`);
}

const signUpSchema = z.object({
  role: z.enum(["brand", "broker"], { message: "Choose brand or broker." }),
  name: z.string().trim().min(1, "Enter your name.").max(120),
  orgName: z.string().trim().min(1, "Enter your company name.").max(120),
  jobTitle: z.string().trim().max(120).optional(),
  email,
  password: z.union([z.literal(""), password]).optional(),
});

export async function signUp(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    role: form.get("role"),
    name: form.get("name"),
    orgName: form.get("orgName"),
    jobTitle: form.get("jobTitle") || undefined,
    email: form.get("email"),
    password: form.get("password") ?? "",
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
  const emailRedirectTo = await confirmUrl(onboardingPath(form.get("next")));
  // Prefills onboarding; the organization is created there by create_organization().
  const data = { name: parsed.data.name, signup_role: parsed.data.role, signup_org_name: parsed.data.orgName, signup_job_title: parsed.data.jobTitle ?? null };
  // With a password: a normal sign-up (the email confirms the address). Without: a magic link.
  const { error } = parsed.data.password
    ? await supabase.auth.signUp({ email: parsed.data.email, password: parsed.data.password, options: { emailRedirectTo, data: { ...data, has_password: true } } })
    : await supabase.auth.signInWithOtp({ email: parsed.data.email, options: { shouldCreateUser: true, emailRedirectTo, data } });
  if (error) return /password/i.test(error.message) ? { fieldErrors: { password: "Choose a stronger password." } } : { error: "We couldn't send the link. Please try again in a minute." };
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

/** Sign in with email and password. */
export async function signInWithPassword(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = z.object({ email, password: z.string().min(1, "Enter your password."), next: z.string().optional() }).safeParse({
    email: form.get("email"), password: form.get("password"), next: form.get("next") ?? undefined,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0])] ??= issue.message;
    return { fieldErrors };
  }
  if (!supabaseConfigured()) return notConfigured();
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) {
    if (/not confirmed/i.test(error.message)) return { error: "Confirm your email first: open the link we sent when you signed up, or use \u201cEmail me a link\u201d instead." };
    if (/rate|too many/i.test(error.message)) return { error: "Too many attempts. Wait a few minutes, or use \u201cEmail me a link\u201d." };
    return { error: "That email and password don\u2019t match. Try again, reset your password, or use \u201cEmail me a link\u201d." };
  }
  redirect(safeNext(parsed.data.next));
}

/** Email a password-reset link. Never reveals whether the account exists. */
export async function sendPasswordReset(_prev: AuthFormState, form: FormData): Promise<AuthFormState> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { fieldErrors: { email: parsed.error.issues[0].message } };
  if (!supabaseConfigured()) return notConfigured();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: await confirmUrl("/account/password?reset=1") });
  if (error && /rate/i.test(error.message)) return { error: "Too many requests. Please wait a minute and try again." };
  redirect(`/auth/check-email?from=reset&email=${encodeURIComponent(parsed.data)}`);
}

export type PasswordState = { ok?: string; error?: string } | undefined;

/** Set or change the signed-in person's password (also the last step of a reset). */
export async function setPassword(_prev: PasswordState, form: FormData): Promise<PasswordState> {
  const parsed = z.object({ password, confirm: z.string() }).refine((v) => v.password === v.confirm, { message: "The two passwords don\u2019t match.", path: ["confirm"] })
    .safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return { error: "Your session has expired. Request a new reset link." };
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password, data: { has_password: true } });
  if (error) return { error: /same|different/i.test(error.message) ? "Choose a password you haven\u2019t used here before." : /weak|password/i.test(error.message) ? "Choose a stronger password." : "Couldn\u2019t save your password. Please try again." };
  revalidatePath("/app/settings");
  return { ok: "Password saved. You can now sign in with your email and password, or with an emailed link." };
}
