import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { coverageSummary, FREQ_LABEL, topRetailers } from "@/lib/coverage";
import { fitScore } from "@/lib/fit";
import { getReference } from "@/lib/reference";
import { briefToFit, type BriefRow } from "@/lib/search";
import { loadLiveListings } from "@/lib/search-data";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Compare brokers", robots: { index: false } };

export default async function Compare({ searchParams }: { searchParams: Promise<{ ids?: string | string[] }> }) {
  const session = await getSession();
  if (session?.org?.type !== "brand") redirect("/app");
  const raw = (await searchParams).ids;
  const ids = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((x) => /^[0-9a-f-]{36}$/.test(x)).slice(0, 3);
  const [all, ref] = await Promise.all([loadLiveListings(), getReference()]);
  const db = await createClient();
  const { data: brief } = await db.from("briefs").select("*").is("archived_at", null).order("updated_at", { ascending: false }).limit(1).maybeSingle();
  const fitBrief = brief ? briefToFit(brief as BriefRow, ref) : null;
  const cols = ids.map((id) => all.find((l) => l.id === id)).filter(Boolean) as typeof all;
  const names = (list: { id: number; name: string }[], xs: number[]) => xs.map((i) => list.find((x) => x.id === i)?.name).filter(Boolean).join(", ") || "—";
  const rows: [string, (l: (typeof cols)[number]) => string][] = [
    ...(fitBrief ? [[`Fit to “${(brief as BriefRow).title}”`, (l: (typeof cols)[number]) => String(fitScore(fitBrief, l)?.score ?? "—")] as [string, (l: (typeof cols)[number]) => string]] : []),
    ["HQ", (l) => l.hq ?? "—"],
    ["Coverage", (l) => coverageSummary(l.states, ref.states, ref.regions)],
    ["Top retailers", (l) => topRetailers(l.retailers).map((r) => `${r.name} (${FREQ_LABEL[r.freq].toLowerCase()})`).join(", ") || "—"],
    ["Channels", (l) => names(ref.channels, l.channels)],
    ["Categories", (l) => names(ref.categories, l.categories)],
    ["Conflicts", (l) => names(ref.categories, l.conflicts)],
    ["Distributors", (l) => names(ref.distributors, l.distributors)],
    ["Verified", (l) => (l.verified ? "Yes" : "No")],
    ["Taking new lines", (l) => (l.notTakingNewLines ? "No" : "Yes")],
  ];
  return (
    <section className="bench-section bench-stack">
      <div className="text_title"><Link className="bench-link" href="/app/saved">Saved brokers</Link></div>
      <h1 className="bench-h-section">Compare</h1>
      {cols.length < 2 ? (
        <p style={{ margin: 0 }}>Pick two or three brokers on your <Link className="bench-link" href="/app/saved">saved list</Link> to compare.</p>
      ) : (
        <div className="bench-table-wrap">
          <table className="bench-table">
            <thead><tr><th scope="col"><span className="bench-sr-only">Field</span></th>{cols.map((l) => <th key={l.id} scope="col"><Link className="bench-link" href={`/brokers/${l.slug}`}>{l.name}</Link></th>)}</tr></thead>
            <tbody>{rows.map(([label, fn]) => <tr key={label}><th scope="row">{label}</th>{cols.map((l) => <td key={l.id}>{fn(l)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
