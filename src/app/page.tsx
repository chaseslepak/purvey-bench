import Link from "next/link";
import { Comparison } from "@/components/site/Comparison";
import { CtaBand } from "@/components/site/CtaBand";
import { HowItWorks } from "@/components/site/HowItWorks";
import { MarketList } from "@/components/site/MarketList";
import { loadCoverage } from "@/lib/market";

export const revalidate = 3600;

const HERO_IMG = "https://cdn.prod.website-files.com/69bdcd2f869a6d3500f34c17/6a565ac46229979185792b63_ChatGPT%20Image%20Jul%2014%2C%202026%2C%2011_41_01%20AM";

export default async function Home() {
  const coverage = await loadCoverage(30);
  return (
    <>
      <section className="section_hero bench-hero">
        {/* eslint-disable-next-line @next/next/no-img-element -- same responsive image markup as the live site */}
        <img
          src={`${HERO_IMG}.jpg`}
          srcSet={`${HERO_IMG}-p-500.jpg 500w, ${HERO_IMG}-p-800.jpg 800w, ${HERO_IMG}-p-1080.jpg 1080w, ${HERO_IMG}.jpg 1402w`}
          sizes="(max-width: 1402px) 100vw, 1402px"
          alt=""
          className="img"
          fetchPriority="high"
        />
        <div className="bench-hero-scrim" aria-hidden="true" />
        <div className="hero_space" />
        <div className="padding-global padding-section-small">
          <div className="container-large">
            <div className="hero_content">
              <div>
                <div className="text_title" style={{ color: "var(--pv-white)" }}>Purvey Bench</div>
                <div className="spacer-medium" />
                <h1 className="heading">Find the broker who already calls on your buyers.</h1>
                <div className="spacer-xlarge" />
                <div className="hero-max">
                  <p>
                    Search food and beverage brokers by the retailers, regions, channels and distributors they actually
                    cover. Free for brands, always.
                  </p>
                </div>
              </div>
              <div className="button-group">
                <div className="button_wrap" style={{ paddingLeft: 0 }}>
                  <Link href="/find" className="button w-button">Find a broker</Link>
                </div>
                <div className="button_wrap" style={{ paddingLeft: 0 }}>
                  <Link href="/for-brokers" className="button is-outline w-button">List your brokerage</Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
      <HowItWorks />
      {coverage.length > 0 && (
        <section className="bench-section bench-stack">
          <MarketList items={coverage} audience="brands" heading="Accounts our brokers call on"
            lede="Retailers and distributors that brokers listed on Bench work with today. Pick one to see who covers it." />
        </section>
      )}
      <Comparison />
      <CtaBand />
    </>
  );
}
