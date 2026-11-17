import type { Metadata } from "next";
import Link from "next/link";
import { CtaBand } from "@/components/site/CtaBand";
import { siteLinks } from "@/lib/site";
import { CopyBlock } from "./CopyBlock";

export const metadata: Metadata = {
  title: "Broker kit for food and beverage brands",
  description: "A Broker-Ready checklist, the questions to ask a food broker on the first call, the terms to settle in a broker agreement, and a broker-of-record letter template. Free from Purvey Bench.",
};

const READY: [string, string][] = [
  ["Item data", "UPC or GTIN for every item, case pack, case and pallet dimensions and weights (Ti × Hi), shelf life, and storage (ambient, chilled or frozen)."],
  ["Pricing", "Your price to the distributor, the distributor's price to the retailer, a suggested retail price, and the margin each step keeps. Brokers read this before anything else."],
  ["Distribution", "Which distributors you're set up with (KeHE, UNFI, a regional wholesaler, DSD) or the plan to get there. A retailer can't buy what it can't order."],
  ["Supply", "Production capacity, lead times and minimums, so a new account doesn't outrun your co-packer."],
  ["Insurance and documents", "Product liability insurance (most retailers ask for a certificate), spec sheets, certifications and a W-9."],
  ["Trade budget", "Money set aside for slotting or free fill, opening promotions, demos and samples, and a reserve for the deductions that follow."],
  ["Sales materials", "A one-page sell sheet, a short deck, current retail photos and any velocity data you have."],
  ["A responsive owner", "One person who answers your broker within a day. Brokers put their time into the lines that answer."],
];

const QUESTIONS = [
  "Which of my target accounts do you call on today, and how often: weekly, monthly or occasionally?",
  "Do you work with the headquarters buyer, the stores, or both? Who handles retail merchandising?",
  "Which lines do you carry now, and do any compete with mine?",
  "When are the next category reviews for my category at those accounts?",
  "How do you report: call notes, a portal, a monthly recap? How often will I hear from you?",
  "How are you paid: a percent of net sales, a monthly retainer, or both? Is there a minimum term?",
  "Who reviews deductions and promotions with the distributor and the retailer?",
  "Can I speak with two brands about my size that you represent?",
];

const TERMS: [string, string][] = [
  ["Territory", "Define it by retailer, banner or division and by distributor, not only by state. Name any accounts you keep in-house."],
  ["Commission base", "Spell out what the percent is paid on: invoiced sales, or net of deductions, promotions, spoils and returns. Say when it's paid (for example, after you are paid)."],
  ["Retainer", "The monthly amount, what it covers, and when it ends or converts to commission only."],
  ["Term and termination", "The minimum term, the notice period, and how long commission continues on accounts the broker opened (the tail)."],
  ["Exclusivity and conflicts", "Whether the broker can carry competing items, and whether you can use another broker in the same accounts."],
  ["Promotions and deductions", "Who can commit your trade dollars, and who reviews and disputes deductions."],
  ["Samples and demos", "Who pays for samples, demos and shipping, and up to what amount."],
  ["Reporting", "What you'll receive and how often, kept simple enough that it actually happens."],
];

const BOR = `[Your company letterhead]

[Date]

To: [Retailer or distributor name], [Buyer or vendor setup contact]

Re: Broker of record for [Your company name]

Effective [date], [Broker company name] is the broker of record for [Your company name] at [Retailer / banner / division] for the following items: [items or "all items"].

Please direct item setup, category review and promotion communication for these items to:
[Broker contact name], [title]
[email] · [phone]

This letter replaces any previous broker of record for these items at this account. [Your company name] continues to invoice and to receive payment directly.

[Name]
[Title], [Your company name]
[email] · [phone]`;

/** Free broker kit for brands: checklist, first-call questions, agreement terms and a broker-of-record letter. */
export default function BrokerKit() {
  return (
    <>
      <section className="bench-section is-cream bench-stack">
        <div className="text_title">Broker kit</div>
        <h1 className="bench-h-section">Everything to have ready before you hire a food broker</h1>
        <p className="bench-lede" style={{ margin: 0, maxWidth: "48rem" }}>
          Brokers take on the lines that are easiest to sell. Use this kit to get Broker-Ready, run a good first call and agree terms that fit how food and beverage actually gets paid.
        </p>
        <div className="bench-row">
          <Link href="/find" className="button w-button">Find brokers</Link>
          <a href="#bor" className="button bench-btn-ghost w-button">Broker-of-record letter</a>
        </div>
      </section>

      <section className="bench-section bench-stack" aria-labelledby="ready-h">
        <h2 id="ready-h" className="bench-h-section" style={{ fontSize: "1.75rem" }}>1. The Broker-Ready checklist</h2>
        <ul className="bench-checklist" style={{ maxWidth: "52rem" }}>
          {READY.map(([t, b]) => <li key={t}><strong>{t}.</strong> {b}</li>)}
        </ul>
      </section>

      <section className="bench-section bench-stack" aria-labelledby="q-h">
        <h2 id="q-h" className="bench-h-section" style={{ fontSize: "1.75rem" }}>2. Questions for the first call</h2>
        <ol className="bench-kit-list">
          {QUESTIONS.map((q) => <li key={q}>{q}</li>)}
        </ol>
        <p className="bench-small bench-muted" style={{ margin: 0 }}>Every Bench profile already lists the retailers a broker calls on and how often, so you can skip straight to the questions that matter.</p>
      </section>

      <section className="bench-section bench-stack" aria-labelledby="t-h">
        <h2 id="t-h" className="bench-h-section" style={{ fontSize: "1.75rem" }}>3. Terms to settle in your broker agreement</h2>
        <div className="bench-table-wrap" tabIndex={0} role="region" aria-labelledby="t-h">
          <table className="bench-table">
            <thead><tr><th scope="col">Term</th><th scope="col">What to agree</th></tr></thead>
            <tbody>{TERMS.map(([t, b]) => <tr key={t}><th scope="row">{t}</th><td>{b}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="bench-small bench-muted" style={{ margin: 0 }}>This is a checklist, not legal advice. Have an attorney who knows food and beverage review any agreement before you sign it.</p>
      </section>

      <section id="bor" className="bench-section bench-stack" aria-labelledby="bor-h">
        <h2 id="bor-h" className="bench-h-section" style={{ fontSize: "1.75rem" }}>4. Broker-of-record letter</h2>
        <p style={{ margin: 0 }}>Retailers and distributors usually want this letter before they&rsquo;ll work with your new broker. Copy it, fill in the brackets and send it on your letterhead.</p>
        <CopyBlock text={BOR} label="broker-of-record letter" />
      </section>

      <section className="bench-section is-cream bench-stack" aria-labelledby="help-h">
        <h2 id="help-h" className="bench-h-section" style={{ fontSize: "1.75rem" }}>Want help?</h2>
        <p style={{ margin: 0 }}>Once you&rsquo;re working with a broker on Bench, the deal room tracks progress by account and checks commission invoices against your sales. Purvey can also run the broker search for you.</p>
        <div className="bench-row">
          <Link href="/sign-up?role=brand" className="button w-button">Create a free brand account</Link>
          <a href={siteLinks.contact} className="button bench-btn-ghost w-button">Book a strategy call</a>
        </div>
      </section>
      <CtaBand />
    </>
  );
}
