import Link from "next/link";
import { getSession } from "@/lib/session";

/**
 * The Bench bar that sits under the purveycpg.com header. It is part of the
 * app (not the site chrome), so it stays visible in embedded mode.
 */
export async function BenchNav() {
  const session = await getSession();
  return (
    <nav className="bench-subnav" aria-label="Purvey Bench">
      <Link href="/" className="bench-subnav_brand">Purvey Bench</Link>
      <div className="bench-subnav_links">
        <Link href="/find" className="bench-subnav_link">Find brokers</Link>
        {session?.org?.type === "brand" && (
          <>
            <Link href="/app/briefs" className="bench-subnav_link">Briefs</Link>
            <Link href="/app/saved" className="bench-subnav_link">Saved</Link>
          </>
        )}
        {session?.org?.type === "broker" && (
          <>
            <Link href="/app/listing" className="bench-subnav_link">Listing</Link>
            <Link href="/app/analytics" className="bench-subnav_link">Analytics</Link>
          </>
        )}
        {!session && (
          <>
            <Link href="/for-brokers" className="bench-subnav_link">For brokers</Link>
            <Link href="/pricing" className="bench-subnav_link">Pricing</Link>
          </>
        )}
        {session ? (
          <>
            {session.isAdmin && <Link href="/admin" className="bench-subnav_link">Admin</Link>}
            <Link href="/app/inbox" className="bench-subnav_link">Inbox</Link>
            {session.org && <Link href="/app/team" className="bench-subnav_link">Team</Link>}
            <Link href="/app" className="bench-subnav_link">Dashboard</Link>
            <Link href="/app/settings" className="bench-subnav_link">Settings</Link>
            <form action="/auth/sign-out" method="post">
              <button type="submit" className="bench-subnav_link" style={{ background: "none", border: 0, cursor: "pointer" }}>
                Sign out
              </button>
            </form>
          </>
        ) : (
          <>
            <Link href="/sign-in" className="bench-subnav_link">Sign in</Link>
            <Link href="/sign-up" className="button is-small w-button">Get started</Link>
          </>
        )}
      </div>
    </nav>
  );
}
