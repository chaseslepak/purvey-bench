export function HowItWorks() {
  return (
    <section className="bench-section is-cream bench-stack" aria-labelledby="how-heading">
      <div className="text_title">How it works</div>
      <h2 id="how-heading" className="bench-h-section">Matched on real coverage, not claims.</h2>
      <div className="bench-grid-2" style={{ marginTop: 12 }}>
        <div className="bench-stack">
          <h3 className="bench-eyebrow">For brands · free</h3>
          <ol className="bench-steps" style={{ gridTemplateColumns: "1fr" }}>
            <li><strong>Search by who they call on.</strong> Filter by retailer, state, channel, distributor and category.</li>
            <li><strong>Write a private brief.</strong> Bench ranks brokers by fit and shows why: &ldquo;Covers Kroger weekly, Meijer monthly.&rdquo;</li>
            <li><strong>Reach out.</strong> See contact details and message brokers directly. Only your team sees your briefs.</li>
          </ol>
        </div>
        <div className="bench-stack">
          <h3 className="bench-eyebrow">For brokers · $100 a month</h3>
          <ol className="bench-steps" style={{ gridTemplateColumns: "1fr" }}>
            <li><strong>Build your listing.</strong> Retailers with call frequency, states, channels, distributors, categories and terms.</li>
            <li><strong>Go live.</strong> One flat price. No tiers, no lead fees, no paid placement.</li>
            <li><strong>Hear from brands that fit.</strong> Brands start the conversation; you reply in one managed inbox.</li>
          </ol>
        </div>
      </div>
    </section>
  );
}
