import Link from "next/link";

export default function NotFound() {
  return (
    <section className="bench-section is-cream bench-stack">
      <div className="text_title">404</div>
      <h1 className="bench-h-section">We couldn&rsquo;t find that page.</h1>
      <div><Link href="/" className="button w-button">Back to Purvey Bench</Link></div>
    </section>
  );
}
