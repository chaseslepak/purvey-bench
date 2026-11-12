"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Any page that fails to render: say so plainly and offer a retry. */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <section className="bench-section is-cream bench-stack" role="alert">
      <div className="text_title">Something went wrong</div>
      <h1 className="bench-h-section">We couldn&rsquo;t load this page.</h1>
      <p className="bench-lede" style={{ margin: 0 }}>Please try again. If it keeps happening, email bench@purveycpg.com{error.digest ? ` and mention code ${error.digest}` : ""}.</p>
      <div className="bench-row">
        <button type="button" className="button w-button" onClick={() => reset()}>Try again</button>
        <Link href="/" className="button bench-btn-ghost w-button">Back to Purvey Bench</Link>
      </div>
    </section>
  );
}
