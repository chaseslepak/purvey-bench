import type { Metadata } from "next";
import Link from "next/link";
import { ResetRequestForm } from "@/components/auth/ResetForms";

export const metadata: Metadata = { title: "Reset your password", robots: { index: false } };

export default function ResetPassword() {
  return (
    <section className="bench-section is-cream">
      <div className="bench-grid-2" style={{ alignItems: "start" }}>
        <div className="bench-stack">
          <div className="text_title">Purvey Bench</div>
          <h1 className="bench-h-section">Reset your password</h1>
          <p className="bench-lede">We&rsquo;ll email you a link to choose a new one. Or skip passwords: sign in with an emailed link instead.</p>
        </div>
        <div className="bench-card is-white bench-stack">
          <ResetRequestForm />
          <p className="bench-small"><Link className="bench-link" href="/sign-in">Back to sign in</Link></p>
        </div>
      </div>
    </section>
  );
}
