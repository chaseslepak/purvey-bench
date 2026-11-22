import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import { getReference } from "@/lib/reference";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Brand profile" };

const LABEL: Record<string, Record<string, string>> = {
  stage: { launching: "Launching", regional: "Regional", national: "National", established: "Established" },
  annual_revenue_band: { pre_revenue: "Pre-revenue", under_250k: "Under $250K", "250k_1m": "$250K–$1M", "1m_5m": "$1M–$5M", "5m_20m": "$5M–$20M", "20m_plus": "$20M+" },
  timeline: { now: "Now", "3_months": "Within 3 months", "6_months": "Within 6 months", exploring: "Exploring" },
  commission_pref: { pct_net_sales: "% of net sales", retainer_plus_pct: "Retainer + %", retainer_only: "Retainer only" },
  trade_budget_band: { under_10k: "Under $10K", "10k_50k": "$10K–$50K", "50k_150k": "$50K–$150K", "150k_plus": "$150K+" },
};
const money = (n: number | null) => (n == null ? "—" : `$${Number(n).toFixed(2)}`);

/** Read-only view of a brand's full profile, so Purvey can check a setup before handing it over. */
export default async function AdminBrandProfile({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const id = (await params).id;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const db = createAdminClient();
  const [{ data: org }, { data: p }, { data: products }, ref] = await Promise.all([
    db.from("organizations").select("name, type, website, hq_city, hq_state, created_at, org_members(role, users!org_members_user_id_fkey(name, email))").eq("id", id).maybeSingle(),
    db.from("brand_profiles").select("*").eq("org_id", id).maybeSingle(),
    db.from("brand_products").select("*").eq("org_id", id).order("sort"),
    getReference(),
  ]);
  if (!org || org.type !== "brand") notFound();
  const pr = (p ?? {}) as Record<string, unknown>;
  const names = (ids: unknown, list: { id: number; name: string }[], other?: unknown) =>
    [...((ids as number[]) ?? []).map((i) => list.find((x) => x.id === i)?.name ?? `#${i}`), ...((other as string[]) ?? [])].join(", ") || "—";
  const owner = ((org.org_members ?? []) as unknown as { role: string; users: { name: string | null; email: string } | null }[]).find((m) => m.role === "owner")?.users;
  const rows: [string, string][] = [
    ["Owner", owner ? `${owner.name ?? ""} ${owner.email}`.trim() : "None yet (add one on Accounts)"],
    ["Website", org.website ?? "—"],
    ["HQ", [org.hq_city, org.hq_state].filter(Boolean).join(", ") || "—"],
    ["Founded", String(pr.founded_year ?? "—")],
    ["Stage", LABEL.stage[pr.stage as string] ?? "—"],
    ["Annual revenue", LABEL.annual_revenue_band[pr.annual_revenue_band as string] ?? "—"],
    ["Current doors", pr.current_doors != null ? String(pr.current_doors) : "—"],
    ["Categories", names(pr.categories, ref.categories, pr.other_categories)],
    ["Certifications", ((pr.certifications as string[]) ?? []).join(", ").replace(/_/g, " ") || "—"],
    ["Storage", String(pr.storage ?? "—")],
    ["Retailers today", names(pr.current_retailers, ref.retailers, pr.other_current_retailers)],
    ["Distributors today", names(pr.current_distributors, ref.distributors)],
    ["Channels today", names(pr.current_channels, ref.channels, pr.other_current_channels)],
    ["States today", ((pr.current_states as string[]) ?? []).join(", ") || "—"],
    ["Target retailers", names(pr.target_retailers, ref.retailers, pr.other_target_retailers)],
    ["Target distributors", names(pr.target_distributors, ref.distributors)],
    ["Target channels", names(pr.target_channels, ref.channels, pr.other_target_channels)],
    ["Target regions", ((pr.target_regions as string[]) ?? []).join(", ") || "—"],
    ["Target states", ((pr.target_states as string[]) ?? []).join(", ") || "—"],
    ["Timeline", LABEL.timeline[pr.timeline as string] ?? "—"],
    ["Commission", [LABEL.commission_pref[pr.commission_pref as string], pr.max_rate != null ? `up to ${pr.max_rate}%` : null, pr.max_retainer != null ? `retainer up to $${pr.max_retainer}` : null].filter(Boolean).join(", ") || "—"],
    ["Trade budget", LABEL.trade_budget_band[pr.trade_budget_band as string] ?? "—"],
  ];
  return (
    <section className="bench-section bench-stack">
      <p className="bench-small" style={{ margin: 0 }}><Link className="bench-link" href="/admin/accounts">← Accounts</Link></p>
      <h1 className="bench-h-section" style={{ fontSize: "1.75rem", margin: 0 }}>{org.name}</h1>
      <p className="bench-muted" style={{ margin: 0 }}>Read-only check of what brokers will see. To change it, update the brand spec and run it again on <Link className="bench-link" href="/admin/brands/setup">Set up a client brand</Link>, or the owner can edit it once signed in.</p>
      {pr.about ? <p style={{ margin: 0 }}>{String(pr.about)}</p> : null}
      <dl className="bench-dl">{rows.flatMap(([k, v]) => [<dt key={`${k}-t`}>{k}</dt>, <dd key={`${k}-d`}>{v}</dd>])}</dl>
      {pr.looking_for ? <><h2 className="bench-h-section" style={{ fontSize: "1.25rem", margin: 0 }}>What they want from a broker</h2><p style={{ margin: 0 }}>{String(pr.looking_for)}</p></> : null}
      <h2 className="bench-h-section" style={{ fontSize: "1.25rem", margin: 0 }}>Products ({products?.length ?? 0})</h2>
      <div className="bench-table-wrap">
        <table className="bench-table">
          <thead><tr><th scope="col">Product</th><th scope="col">Size</th><th scope="col">Case</th><th scope="col">MSRP</th><th scope="col">Wholesale</th><th scope="col">UPC</th><th scope="col">Shelf life</th></tr></thead>
          <tbody>
            {(products ?? []).map((x) => (
              <tr key={x.id}>
                <td>{x.name}{x.description && <div className="bench-small bench-muted">{x.description}</div>}</td>
                <td>{x.size ?? "—"}</td><td>{x.case_pack ?? "—"}</td><td>{money(x.msrp)}</td><td>{money(x.wholesale)}</td><td>{x.upc ?? "—"}</td><td>{x.shelf_life_days ? `${x.shelf_life_days} days` : "—"}</td>
              </tr>
            ))}
            {!products?.length && <tr><td colSpan={7} className="bench-muted">No products yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
