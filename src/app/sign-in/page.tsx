import type { Metadata } from "next";
import Link from "next/link";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { SignInForm } from "@/components/auth/SignInForm";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  link: "That sign-in link has expired or was already used. Request a new one below.",
  oauth: "Google sign-in didn't complete. Please try again.",
  config: "Sign-in isn't configured in this environment yet.",
};

export default async function SignIn({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return (
    <section className="bench-section is-cream">
      <div className="bench-grid-2" style={{ alignItems: "start" }}>
        <div className="bench-stack">
          <div className="text_title">Purvey Bench</div>
          <h1 className="bench-h-section">Sign in</h1>
          <p className="bench-lede">We&rsquo;ll email you a one-time link. No password to remember.</p>
        </div>
        <div className="bench-card is-white bench-stack">
          {error && ERRORS[error] && <p className="bench-notice is-warn" role="alert">{ERRORS[error]}</p>}
          <SignInForm next={next} />
          <div className="bench-row" style={{ justifyContent: "center" }}><span className="bench-small bench-muted">or</span></div>
          <GoogleButton next={next} />
          <p className="bench-small">
            New here? <Link className="bench-link" href="/sign-up">Create a free account</Link>.
          </p>
        </div>
      </div>
    </section>
  );
}
