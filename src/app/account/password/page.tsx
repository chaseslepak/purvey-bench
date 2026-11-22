import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SetPasswordForm } from "@/components/auth/ResetForms";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

/** Where a password-reset email lands (already signed in by /auth/confirm). */
export default async function NewPassword() {
  const { data } = await (await createClient()).auth.getUser();
  if (!data.user) redirect("/sign-in/reset");
  return (
    <section className="bench-section is-cream bench-stack" style={{ maxWidth: 720 }}>
      <div className="text_title">Purvey Bench</div>
      <h1 className="bench-h-section">Choose a new password</h1>
      <p className="bench-muted" style={{ margin: 0 }}>For {data.user.email}.</p>
      <div className="bench-card is-white">
        <SetPasswordForm label="Save new password" done={<div><Link href="/app" className="button w-button">Continue to Purvey Bench</Link></div>} />
      </div>
    </section>
  );
}
