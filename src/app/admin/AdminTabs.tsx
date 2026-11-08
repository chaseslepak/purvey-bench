"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  ["/admin", "Overview"], ["/admin/listings", "Listings"], ["/admin/verification", "Verification"], ["/admin/brands", "Brands"],
  ["/admin/requests", "Requests"], ["/admin/reports", "Reports"], ["/admin/lists", "Lists"], ["/admin/audit", "Audit log"],
] as const;

export function AdminTabs() {
  const path = usePathname();
  return (
    <nav className="bench-tabs" aria-label="Admin">
      {TABS.map(([href, label]) => {
        const on = href === "/admin" ? path === "/admin" : path.startsWith(href);
        return <Link key={href} href={href} aria-current={on ? "page" : undefined}>{label}</Link>;
      })}
    </nav>
  );
}
