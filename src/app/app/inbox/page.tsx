import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BRAND_STAGES, BROKER_STAGES, loadThreads, stageLabel } from "@/lib/inbox/load";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Inbox", robots: { index: false } };

const when = (iso: string) => {
  const d = new Date(iso);
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default async function Inbox({ searchParams }: { searchParams: Promise<{ tab?: string; stage?: string; q?: string; assignee?: string }> }) {
  const session = await getSession();
  if (!session?.org) redirect("/app/onboarding");
  const sp = await searchParams;
  const tab = sp.tab === "unread" || sp.tab === "archived" ? sp.tab : "all";
  const stages = session.org.type === "brand" ? BRAND_STAGES : BROKER_STAGES;
  const stage = stages.some(([k]) => k === sp.stage) ? sp.stage : undefined;
  const q = (sp.q ?? "").slice(0, 100);
  const db = await createClient();
  const { data: team } = await db.from("org_members").select("user_id, users!org_members_user_id_fkey(name, email)").eq("org_id", session.org.id);
  const teammates = (team ?? []).map((m) => { const u = m.users as unknown as { name: string | null; email: string } | null; return { id: m.user_id as string, name: u?.name ?? u?.email ?? "Teammate" }; });
  const nameOf = (id: string | null) => (id === session.userId ? "You" : teammates.find((t) => t.id === id)?.name ?? null);
  const assignee = sp.assignee === "me" ? session.userId : sp.assignee === "none" || teammates.some((t) => t.id === sp.assignee) ? sp.assignee : undefined;
  const threads = await loadThreads(session.org.id, { tab, stage, q, assignee });
  const assigneeParam = sp.assignee === "me" ? "me" : assignee;
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ tab, stage, q, assignee: assigneeParam, ...patch }).filter(([, v]) => v && v !== "all") as [string, string][]);
    return `/app/inbox${p.toString() ? `?${p}` : ""}`;
  };

  return (
    <>
      <section className="bench-section is-cream bench-stack">
        <div className="text_title">{session.org.name}</div>
        <h1 className="bench-h-section">Inbox</h1>
        <p className="bench-lede" style={{ margin: 0 }}>
          {session.org.type === "brand" ? "Conversations you've started with brokers. Start a new one from any broker's profile." : "Conversations brands have started with you. Only brands can start a conversation; you reply here."}
        </p>
      </section>
      <section className="bench-section bench-stack" style={{ padding: 24 }}>
        <div className="bench-row" style={{ justifyContent: "space-between" }}>
          <nav className="bench-chips" aria-label="Inbox filters">
            {(["all", "unread", "archived"] as const).map((t) => <Link key={t} href={link({ tab: t })} className="bench-chip" aria-current={tab === t ? "page" : undefined}>{t[0].toUpperCase() + t.slice(1)}</Link>)}
            {teammates.length > 1 && <Link href={link({ assignee: assigneeParam === "me" ? undefined : "me" })} className="bench-chip" aria-current={assigneeParam === "me" ? "page" : undefined}>Assigned to me</Link>}
          </nav>
          <form method="get" action="/app/inbox" className="bench-row" role="search">
            {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
            {teammates.length > 1 && (
              <>
                <label htmlFor="inbox-assignee" className="bench-sr-only">Assigned to</label>
                <select id="inbox-assignee" name="assignee" className="bench-input" style={{ minHeight: 44, width: "auto" }} defaultValue={assigneeParam ?? ""}>
                  <option value="">Anyone</option>
                  <option value="me">Me</option>
                  <option value="none">Unassigned</option>
                  {teammates.filter((t) => t.id !== session.userId).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </>
            )}
            <label htmlFor="inbox-stage" className="bench-sr-only">Stage</label>
            <select id="inbox-stage" name="stage" className="bench-input" style={{ minHeight: 44, width: "auto" }} defaultValue={stage ?? ""}>
              <option value="">Any stage</option>
              {stages.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
            <label htmlFor="inbox-q" className="bench-sr-only">Search messages</label>
            <input id="inbox-q" name="q" className="bench-input" style={{ minHeight: 44, width: 220 }} placeholder="Search names and messages" defaultValue={q} />
            <button className="button is-small w-button" type="submit">Search</button>
          </form>
        </div>
        {threads.length === 0 ? (
          <p className="bench-muted" style={{ margin: 0 }}>
            {q || stage || assignee || tab !== "all" ? "No conversations match." : session.org.type === "brand" ? <>No conversations yet. <Link className="bench-link" href="/find">Find a broker</Link> and send a message.</> : "No conversations yet. Brands will appear here when they message you."}
          </p>
        ) : (
          <ul className="bench-threads">
            {threads.map((t) => (
              <li key={t.id}>
                <Link href={`/app/inbox/${t.id}`} className={`bench-thread${t.unread ? " is-unread" : ""}`}>
                  <span className="bench-thread_name">{t.otherName}{t.unread && <span className="bench-sr-only"> (unread)</span>}</span>
                  <span className="bench-thread_meta">
                    {t.declined && <span className="bench-tag">Closed</span>}
                    {t.muted && <span className="bench-tag">Muted</span>}
                    {t.assignee && nameOf(t.assignee) && <span className="bench-tag">{nameOf(t.assignee)}</span>}
                    <span className="bench-tag is-mist">{stageLabel(t.stage)}</span>
                    <time dateTime={t.lastAt}>{when(t.lastAt)}</time>
                  </span>
                  <span className="bench-thread_body">{t.lastFromMe ? "You: " : ""}{t.lastBody}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
