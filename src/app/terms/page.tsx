import type { Metadata } from "next";
import Link from "next/link";
import { siteLinks } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of Service", description: "The terms for using Purvey Bench as a brand or a broker, including listing subscriptions and billing." };

const UPDATED = "November 12, 2026";

/** Plain-English terms that describe how Bench actually works. Reviewed by Purvey before publishing. */
export default function Page() {
  return (
    <article className="bench-section bench-stack bench-legal">
      <div className="text_title">Legal</div>
      <h1 className="bench-h-section">Terms of Service</h1>
      <p className="bench-muted">Last updated {UPDATED}</p>

      <p>Purvey Bench (&ldquo;Bench&rdquo;) is a directory run by Purvey CPG (&ldquo;Purvey&rdquo;, &ldquo;we&rdquo;) where food and beverage brands find and contact brokers. By creating an account or using Bench you agree to these terms. If you use Bench for a company, you agree for that company and confirm you can.</p>

      <h2>1. Accounts</h2>
      <p>Give accurate information and keep your sign-in email secure. You&rsquo;re responsible for what happens under your account and your team. Owners control who is on their team. You must be at least 18 and using Bench for business.</p>

      <h2>2. Brands</h2>
      <p>Searching, viewing profiles, briefs, saving brokers and messaging are free for brands. We never ask brands for payment details on Bench. Purvey&rsquo;s separate consulting and placement services are offered under their own agreements.</p>

      <h2>3. Broker listings and billing</h2>
      <ul>
        <li><strong>Plans.</strong> A Bench Listing is $100 a month, billed monthly. While early access lasts, the first 12 brokerages may instead pay $900 for a year, billed up front. Prices exclude any applicable taxes.</li>
        <li><strong>Renewal.</strong> Plans renew automatically at the end of each month or year until cancelled. Payments are processed by Stripe; you authorize us to charge your payment method for each renewal.</li>
        <li><strong>Cancelling.</strong> Cancel any time from Billing. Your listing stays live until the end of the period you&rsquo;ve paid for and isn&rsquo;t renewed. We don&rsquo;t refund partial periods, except where the law requires it or where we end your listing without cause.</li>
        <li><strong>Failed payments.</strong> If a payment fails, your listing stays live for up to 7 days while we retry, then pauses until payment succeeds. Your listing and data are kept.</li>
        <li><strong>Price changes.</strong> We&rsquo;ll give at least 30 days&rsquo; notice by email before a price change applies to your next renewal.</li>
        <li><strong>No paid placement.</strong> Every listing pays the same. Search ranking comes only from fit to a brand&rsquo;s brief or filters, never from payment.</li>
      </ul>

      <h2>4. What you post</h2>
      <p>You own what you post: listings, profiles, documents, messages and reviews. You give Purvey a license to host, display and process it to run Bench. Only post what you have the right to share, and keep it accurate. Brokers must not claim retailer relationships or references they don&rsquo;t have. Reviews must reflect a real working relationship.</p>

      <h2>5. Acceptable use</h2>
      <p>Don&rsquo;t spam, scrape or bulk-export Bench, harass anyone, post unlawful or misleading content, upload malware, try to get around security or limits, or use contact details from Bench for anything other than a genuine business conversation. We may remove content, pause listings or close accounts that break these terms, and will tell you why where we can.</p>

      <h2>6. Verification and reviews</h2>
      <p>A &ldquo;Verified&rdquo; badge means Purvey checked references and retailer relationships at the time. It isn&rsquo;t a guarantee of results. Reviews are the opinions of the brands that wrote them; we may hide reviews that break these terms.</p>

      <h2>7. Deals between brands and brokers</h2>
      <p>Bench helps brands and brokers meet. Any agreement you reach is between you and the other party, and Purvey isn&rsquo;t a party to it unless we sign it. Tools such as deal rooms and commission tracking are for your convenience; check figures against your own records.</p>

      <h2>8. Privacy</h2>
      <p>How we handle personal information is described in the <a className="bench-link" href={siteLinks.privacy}>Purvey Privacy Policy</a>. Account email is used to sign you in and for messages about your account and conversations; you can turn off non-essential emails in Settings.</p>

      <h2>9. Disclaimers and liability</h2>
      <p>Bench is provided &ldquo;as is&rdquo;. We work to keep it available and accurate but don&rsquo;t promise it will be uninterrupted or that any listing, brief or introduction leads to business. To the extent the law allows, Purvey isn&rsquo;t liable for indirect or consequential losses, and our total liability for any claim about Bench is limited to the amount you paid us for Bench in the 12 months before the claim.</p>

      <h2>10. Changes and contact</h2>
      <p>We may update these terms and will post the new date here; for material changes we&rsquo;ll email account owners first. Questions: <a className="bench-link" href={siteLinks.contact}>contact Purvey</a> or email bench@purveycpg.com. See also <Link className="bench-link" href="/pricing">pricing</Link>.</p>
    </article>
  );
}
