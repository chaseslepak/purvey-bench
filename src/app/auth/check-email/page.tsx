import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Check your email", robots: { index: false } };

export default async function CheckEmail({ searchParams }: { searchParams: Promise<{ email?: string; from?: string }> }) {
  const { email, from } = await searchParams;
  // Sign-in deliberately doesn't reveal whether an account exists, so say so honestly.
  const signIn = from === "sign-in";
  return (
    <section className="bench-section is-cream">
      <div style={{ maxWidth: "36rem" }} className="bench-stack">
        <div className="text_title">Check your email</div>
        <h1 className="bench-h-section">{signIn ? "Check your inbox for a sign-in link." : "We sent you a sign-in link."}</h1>
        <p className="bench-lede">
          {signIn
            ? <>If an account exists for {email ? <strong>{email}</strong> : "that address"}, we sent a sign-in link to it. </>
            : email ? <>Open the email we sent to <strong>{email}</strong> and click the link. </> : "Open the email and click the link. "}
          It expires in one hour. If it doesn&rsquo;t arrive in a few minutes, check your spam folder.
        </p>
        {signIn && (
          <p className="bench-small" style={{ margin: 0 }}>
            No email? You may not have an account yet. <Link className="bench-link" href="/sign-up">Create an account</Link>.
          </p>
        )}
        <p className="bench-small">
          Wrong address? <Link className="bench-link" href={signIn ? "/sign-in" : "/sign-up"}>Start again</Link>.
        </p>
      </div>
    </section>
  );
}
