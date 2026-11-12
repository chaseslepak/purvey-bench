import Link from "next/link";

const COPY = {
  brands: { eyebrow: "Purvey Bench", title: "Find the broker who already calls on your buyers.", body: "Search by retailer, region, channel and distributor. Free for brands, always.", cta: "Find a broker", href: "/find" },
  brokers: { eyebrow: "Purvey Bench", title: "Put your coverage in front of brands that fit.", body: "One flat listing, ranked by fit and never by payment. Brands message you directly.", cta: "Start your listing", href: "/sign-up?role=broker" },
} as const;

/** The closing band, in the purveycpg.com "Join us" style, with a Bench call to action. */
export function CtaBand({ audience = "brands" }: { audience?: keyof typeof COPY }) {
  const c = COPY[audience];
  return (
    <section className="section_joinus bench-chrome bench-band">
      <div className="padding-global padding-section-bottom">
        <div className="container-large">
          <div className="w-layout-grid grid-col-2">
            <div className="join_left">
              <div>
                <div className="text_title scroll-into-view">{c.eyebrow}</div>
                <div className="spacer-medium" />
                <div className="title-max is-32rem scroll-into-view">
                  <h2 className="heading-style-h2">{c.title}</h2>
                </div>
                <div className="spacer-medium" />
                <div className="bench-band_body scroll-into-view">{c.body}</div>
              </div>
              <div className="button_wrap scroll-into-view">
                <Link href={c.href} className="button is-secondary w-button">{c.cta}</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
