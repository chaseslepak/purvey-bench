const ROWS: [string, string, string][] = [
  ["Price", "Free, always", "$100 a month, or $300 a year up front"],
  ["Search and full broker profiles", "Yes", "Your listing is searchable"],
  ["Contact details", "Yes, with a free account", "Shown to signed-in brands"],
  ["Messaging", "Start conversations", "Reply to brands that reach out"],
  ["Ranking", "By fit to your brief", "By fit only. Payment never changes position"],
  ["Verification", "Verified badge on vetted brokers", "Purvey checks references and retailers"],
  ["Placement help", "Ask Purvey to run a placement", "—"],
];

export function Comparison() {
  return (
    <section className="bench-section bench-stack" aria-labelledby="compare-heading">
      <div className="text_title">Brands and brokers</div>
      <h2 id="compare-heading" className="bench-h-section">One directory, two simple sides.</h2>
      <div className="bench-table-wrap">
        <table className="bench-table bench-compare">
          <thead>
            <tr><th scope="col"><span className="bench-sr-only">Feature</span></th><th scope="col">Brands</th><th scope="col">Brokers</th></tr>
          </thead>
          <tbody>
            {ROWS.map(([feature, brand, broker]) => (
              <tr key={feature}><th scope="row">{feature}</th><td>{brand}</td><td>{broker}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
