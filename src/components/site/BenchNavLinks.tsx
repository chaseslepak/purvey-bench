"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavItem = { href: string; label: string };

/** The most specific item matching the current path is marked current. */
function currentHref(path: string, items: NavItem[]) {
  return items
    .filter((i) => path === i.href || (i.href !== "/app" && i.href !== "/" && path.startsWith(`${i.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

/** Bench bar links: current-page state, and a Menu toggle on small screens. */
export function BenchNavLinks({ items, signedIn }: { items: NavItem[]; signedIn: boolean }) {
  const path = usePathname() ?? "/";
  // Open for the current page only, so navigating closes the menu.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const cur = currentHref(path, items);
  return (
    <>
      <button type="button" className="bench-subnav_toggle" aria-expanded={open} aria-controls="bench-subnav-links" onClick={() => setOpenOn(open ? null : path)}>
        {open ? "Close" : "Menu"}
      </button>
      <div id="bench-subnav-links" className={`bench-subnav_links${open ? " is-open" : ""}`}>
        {items.map((i) => (
          <Link key={i.href} href={i.href} className="bench-subnav_link" aria-current={i.href === cur ? "page" : undefined}>{i.label}</Link>
        ))}
        {signedIn ? (
          <form action="/auth/sign-out" method="post">
            <button type="submit" className="bench-subnav_link" style={{ background: "none", border: 0, cursor: "pointer" }}>Sign out</button>
          </form>
        ) : (
          <>
            <Link href="/sign-in" className="bench-subnav_link" aria-current={path === "/sign-in" ? "page" : undefined}>Sign in</Link>
            <Link href="/sign-up" className="button is-small w-button">Get started</Link>
          </>
        )}
      </div>
    </>
  );
}
