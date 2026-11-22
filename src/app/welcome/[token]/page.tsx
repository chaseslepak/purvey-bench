import type { Metadata } from "next";
import Link from "next/link";
import { claimAccount } from "./actions";
import { verifyWelcome } from "@/lib/welcome-token";

export const metadata: Metadata = { title: "Your account is ready", robots: { index: false } };

const PROBLEM: Record<string, string> = {
  expired: "This link has expired. Links work for 14 days.",
  used: "This link has already been used, or Purvey sent you a newer one.",
  invalid: "This link isn't valid.",
};

/**
 * Where the "your account is ready" email lands. Signing in happens on the
 * button (a POST), not on page load, so email scanners that open links
 * can't use it up first.
 */
export default async function Welcome({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ e?: string }> }) {
  const { token } = await params;
  const { e } = await searchParams;
  const v = verifyWelcome(token);
  const problem = e ? PROBLEM[e] ?? PROBLEM.invalid : !v.ok ? PROBLEM[v.reason] : null;
  return (
    <section className="bench-section is-cream bench-stack" style={{ maxWidth: 640 }}>
      <div className="text_title">Purvey Bench</div>
      <h1 className="bench-h-section">{problem ? "Let’s get you signed in" : "Your account is ready"}</h1>
      {problem ? (
        <>
          <p className="bench-notice is-warn" role="alert" style={{ margin: 0 }}>{problem}</p>
          <p style={{ margin: 0 }}>Sign in with your email instead and we&rsquo;ll send a fresh link. If you&rsquo;re stuck, reply to Purvey&rsquo;s email.</p>
          <div><Link href="/sign-in" className="button w-button">Sign in with email</Link></div>
        </>
      ) : (
        <>
          <p className="bench-lede" style={{ margin: 0 }}>Purvey set up your account. One click signs you in and confirms your email.</p>
          <form action={claimAccount}>
            <input type="hidden" name="token" value={token} />
            <button type="submit" className="button w-button">Sign in to Purvey Bench</button>
          </form>
          <p className="bench-small bench-muted" style={{ margin: 0 }}>Next time, sign in with an emailed link, or add a password in Settings to use that instead.</p>
        </>
      )}
    </section>
  );
}
