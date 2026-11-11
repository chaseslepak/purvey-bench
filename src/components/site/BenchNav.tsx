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
        <Link href="/for-brokers" className="bench-subnav_link">For brokers</Link>
        <Link href="/pricing" className="bench-subnav_link">Pricing</Link>
        {session ? (
          <>
            {session.isAdmin && <Link href="/admin" className="bench-subnav_link">Admin</Link>}
            <Link href="/app" className="bench-subnav_link">Dashboard</Link>
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
