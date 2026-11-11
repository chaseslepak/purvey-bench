import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms of Service", robots: { index: false } };

/** Placeholder: Purvey's counsel provides the final text before launch. */
export default function Page() {
  return (
    <section className="bench-section bench-stack" style={{ maxWidth: "none" }}>
      <div className="text_title">Legal</div>
      <h1 className="bench-h-section">Terms of Service</h1>
      <p className="bench-notice is-warn">Draft placeholder. Purvey&rsquo;s counsel will provide this page before launch.</p>
    </section>
  );
}
