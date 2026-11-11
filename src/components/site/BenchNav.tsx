import Link from "next/link";
import { BenchNavLinks, type NavItem } from "./BenchNavLinks";
import { getSession } from "@/lib/session";

/**
 * The Bench bar that sits under the purveycpg.com header. It is part of the
 * app (not the site chrome), so it stays visible in embedded mode.
 */
export async function BenchNav() {
  const session = await getSession();
  const type = session?.org?.type;
  const items: NavItem[] = [
    ...(session ? [{ href: "/app", label: "Dashboard" }] : []),
    { href: "/find", label: "Find brokers" },
    ...(type === "brand" ? [{ href: "/app/brand", label: "Brand profile" }, { href: "/app/briefs", label: "Briefs" }, { href: "/app/saved", label: "Saved" }] : []),
    ...(type === "broker" ? [{ href: "/app/listing", label: "Listing" }, { href: "/app/analytics", label: "Analytics" }, { href: "/app/reviews", label: "Reviews" }] : []),
    ...(!session ? [{ href: "/for-brokers", label: "For brokers" }, { href: "/pricing", label: "Pricing" }] : []),
    ...(session ? [{ href: "/app/inbox", label: "Inbox" }] : []),
    ...(session?.org ? [{ href: "/app/team", label: "Team" }] : []),
    ...(type === "broker" && session?.org?.memberRole === "owner" ? [{ href: "/app/billing", label: "Billing" }] : []),
    ...(session ? [{ href: "/app/settings", label: "Settings" }] : []),
    ...(session?.isAdmin ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  return (
    <nav className="bench-subnav" aria-label="Purvey Bench">
      <Link href="/" className="bench-subnav_brand">Purvey Bench</Link>
      <BenchNavLinks items={items} signedIn={Boolean(session)} />
    </nav>
  );
}
