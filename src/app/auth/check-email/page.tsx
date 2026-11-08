import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Check your email", robots: { index: false } };

export default async function CheckEmail({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email } = await searchParams;
  return (
    <section className="bench-section is-cream">
      <div style={{ maxWidth: "36rem" }} className="bench-stack">
        <div className="text_title">Check your email</div>
        <h1 className="bench-h-section">We sent you a sign-in link.</h1>
        <p className="bench-lede">
          {email ? <>Open the email we sent to <strong>{email}</strong> and click the link. </> : "Open the email and click the link. "}
          It expires in one hour. If it doesn&rsquo;t arrive in a few minutes, check your spam folder.
        </p>
        <p className="bench-small">
          Wrong address? <Link className="bench-link" href="/sign-in">Start again</Link>.
        </p>
      </div>
    </section>
  );
}
