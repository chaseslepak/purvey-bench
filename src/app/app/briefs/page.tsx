import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createBrief } from "./actions";
import { getReference } from "@/lib/reference";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Briefs", robots: { index: false } };

export default async function Briefs({ searchParams }: { searchParams: Promise<{ archived?: string }> }) {
  const session = await getSession();
  if (!session?.org) redirect("/app/onboarding");
  if (session.org.type !== "brand") redirect("/app");
  const showArchived = (await searchParams).archived === "1";
  const db = await createClient();
  const q = db.from("briefs").select("id, title, category_id, regions, states, target_retailers, updated_at, archived_at").order("updated_at", { ascending: false });
  const { data: briefs } = await (showArchived ? q.not("archived_at", "is", null) : q.is("archived_at", null));
  const ref = await getReference();

  return (
    <>
      <section className="bench-section is-cream bench-stack">
        <div className="text_title">Private to your team</div>
        <h1 className="bench-h-section">Briefs</h1>
        <p className="bench-lede" style={{ margin: 0 }}>Describe what you need and Bench ranks brokers by fit. Only your teammates can see your briefs; a broker sees a one-time summary only if you attach it to a message.</p>
        <form action={createBrief} className="bench-row" style={{ alignItems: "end" }}>
          <div className="bench-field" style={{ flex: "1 1 260px" }}>
            <label htmlFor="new-title" className="bench-label">New brief</label>
            <input id="new-title" name="title" className="bench-input" placeholder="e.g. Midwest jerky launch" required maxLength={140} />
          </div>
          <button type="submit" className="button w-button">Create brief</button>
        </form>
      </section>
      <section className="bench-section bench-stack">
        <div className="bench-row" style={{ justifyContent: "space-between" }}>
          <h2 className="bench-eyebrow" style={{ margin: 0 }}>{showArchived ? "Archived briefs" : "Active briefs"}</h2>
          <Link className="bench-link bench-small" href={showArchived ? "/app/briefs" : "/app/briefs?archived=1"}>{showArchived ? "Show active" : "Show archived"}</Link>
        </div>
        {briefs?.length ? (
          <div className="bench-table-wrap">
            <table className="bench-table">
              <thead><tr><th scope="col">Brief</th><th scope="col">Category</th><th scope="col">Where</th><th scope="col">Target retailers</th><th scope="col">Updated</th></tr></thead>
              <tbody>
                {briefs.map((b) => (
                  <tr key={b.id}>
                    <td><Link className="bench-link" href={`/app/briefs/${b.id}`}>{b.title}</Link></td>
                    <td>{ref.categories.find((c) => c.id === b.category_id)?.name ?? "—"}</td>
                    <td>{[...b.regions.map((r: string) => ref.regions.find((x) => x.code === r)?.name), ...b.states].filter(Boolean).join(", ") || "—"}</td>
                    <td>{b.target_retailers.length || "—"}</td>
                    <td>{new Date(b.updated_at).toLocaleDateString("en-US", { dateStyle: "medium" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="bench-muted" style={{ margin: 0 }}>{showArchived ? "No archived briefs." : "No briefs yet. Create one above to rank brokers by fit."}</p>
        )}
      </section>
    </>
  );
}
