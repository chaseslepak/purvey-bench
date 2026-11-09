import { NextResponse, type NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";
import { toCsv } from "@/lib/csv";

type Row = Record<string, unknown>;
const one = <T,>(v: unknown) => (Array.isArray(v) ? v[0] : v) as T | null;

/** CSV exports for admins. Reads go through RLS as the admin; each export is audited. */
export async function GET(req: NextRequest) {
  const s = await getSession();
  if (!s?.isAdmin) return new NextResponse("Not found", { status: 404 });
  const db = await createClient();
  const kind = req.nextUrl.searchParams.get("kind");
  let rows: Row[] = [], cols: string[] = [];

  if (kind === "listings") {
    const [{ data }, { data: subs }] = await Promise.all([
      db.from("broker_listings").select("id, org_id, status, admin_paused, verified_at, completeness, live_since, submitted_at, updated_at, organizations!inner(name, slug, hq_city, hq_state, website, suspended_at, created_at)").order("updated_at", { ascending: false }),
      db.from("subscriptions").select("org_id, status, comped, current_period_end, stripe_customer_id"),
    ]);
    const subOf = new Map((subs ?? []).map((r) => [r.org_id, r]));
    rows = (data ?? []).map((l) => {
      const o = one<Row>(l.organizations)!; const sub = subOf.get(l.org_id);
      return { listing_id: l.id, name: o.name, slug: o.slug, status: l.admin_paused ? "paused_admin" : l.status, verified_at: l.verified_at, completeness: l.completeness, hq: [o.hq_city, o.hq_state].filter(Boolean).join(", "), website: o.website,
        subscription: sub?.comped ? "comped" : sub?.status ?? "", period_end: sub?.current_period_end ?? "", stripe_customer: sub?.stripe_customer_id ?? "",
        joined: o.created_at, submitted_at: l.submitted_at, live_since: l.live_since, suspended_at: o.suspended_at };
    });
    cols = ["listing_id", "name", "slug", "status", "verified_at", "completeness", "hq", "website", "subscription", "period_end", "stripe_customer", "joined", "submitted_at", "live_since", "suspended_at"];
  } else if (kind === "brands") {
    const { data } = await db.from("organizations").select("id, name, website, created_at, suspended_at, org_members(role, users!org_members_user_id_fkey(name, email))").eq("type", "brand").order("created_at", { ascending: false });
    rows = (data ?? []).map((b) => {
      const members = (b.org_members ?? []) as unknown as { role: string; users: { name: string | null; email: string } | null }[];
      const owner = members.find((m) => m.role === "owner")?.users;
      return { org_id: b.id, name: b.name, website: b.website, owner_name: owner?.name ?? "", owner_email: owner?.email ?? "", team_size: members.length, joined: b.created_at, suspended_at: b.suspended_at };
    });
    cols = ["org_id", "name", "website", "owner_name", "owner_email", "team_size", "joined", "suspended_at"];
  } else if (kind === "placements") {
    const [{ data: p }, { data: a }] = await Promise.all([
      db.from("placement_requests").select("id, status, note, created_at, updated_at, organizations!placement_requests_brand_org_id_fkey(name), broker_listings(organizations(name)), users:created_by(email)").order("created_at", { ascending: false }),
      db.from("audit_requests").select("id, status, note, created_at, updated_at, organizations:requester_org_id(name), users:requested_by(email)").order("created_at", { ascending: false }),
    ]);
    rows = [
      ...(p ?? []).map((r) => ({ type: "placement", id: r.id, status: r.status, requester: one<Row>(r.organizations)?.name, broker: one<{ organizations: Row }>(r.broker_listings)?.organizations?.name, requested_by: one<Row>(r.users)?.email, note: r.note, created_at: r.created_at, updated_at: r.updated_at })),
      ...(a ?? []).map((r) => ({ type: "commission_audit", id: r.id, status: r.status, requester: one<Row>(r.organizations)?.name, broker: "", requested_by: one<Row>(r.users)?.email, note: r.note, created_at: r.created_at, updated_at: r.updated_at })),
    ];
    cols = ["type", "id", "status", "requester", "broker", "requested_by", "note", "created_at", "updated_at"];
  } else if (kind === "audit") {
    const action = (req.nextUrl.searchParams.get("action") ?? "").slice(0, 60).replace(/[%_]/g, "");
    let q = db.from("audit_log").select("id, action, target_type, target_id, details, created_at, actor_email").order("id", { ascending: false }).limit(50000);
    if (action) q = q.ilike("action", `${action}%`);
    const { data } = await q;
    rows = (data ?? []).map((e) => ({ id: e.id, created_at: e.created_at, actor: e.actor_email ?? "system", action: e.action, target_type: e.target_type, target_id: e.target_id, details: e.details }));
    cols = ["id", "created_at", "actor", "action", "target_type", "target_id", "details"];
  } else {
    return NextResponse.json({ error: "unknown export" }, { status: 400 });
  }

  await db.rpc("admin_log", { p_action: "export.csv", p_target_type: kind, p_target_id: String(rows.length), p_details: {} });
  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(toCsv(rows, cols), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="bench-${kind}-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
