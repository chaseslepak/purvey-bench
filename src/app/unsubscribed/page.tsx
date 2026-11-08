import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Email preferences", robots: { index: false } };

export default async function Unsubscribed({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const failed = (await searchParams).error === "1";
  return (
    <section className="bench-section is-cream bench-stack">
      <div className="text_title">Email preferences</div>
      <h1 className="bench-h-section">{failed ? "That link didn't work" : "You're unsubscribed"}</h1>
      <p className="bench-lede" style={{ margin: 0 }}>
        {failed ? "The unsubscribe link is invalid or incomplete. You can change every email setting in your account." : "You won't get that type of email any more. You can change this any time in your settings."}
      </p>
      <div><Link className="button w-button" href="/app/settings">Email settings</Link></div>
    </section>
  );
}
