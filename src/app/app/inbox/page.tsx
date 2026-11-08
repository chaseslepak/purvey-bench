import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BRAND_STAGES, BROKER_STAGES, loadThreads, stageLabel } from "@/lib/inbox/load";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Inbox", robots: { index: false } };

const when = (iso: string) => {
  const d = new Date(iso);
  const sameDay = new Date().toDateString() === d.toDateString();
  return sameDay ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

export default async function Inbox({ searchParams }: { searchParams: Promise<{ tab?: string; stage?: string; q?: string }> }) {
  const session = await getSession();
  if (!session?.org) redirect("/app/onboarding");
  const sp = await searchParams;
  const tab = sp.tab === "unread" || sp.tab === "archived" ? sp.tab : "all";
  const stages = session.org.type === "brand" ? BRAND_STAGES : BROKER_STAGES;
  const stage = stages.some(([k]) => k === sp.stage) ? sp.stage : undefined;
  const q = (sp.q ?? "").slice(0, 100);
  const threads = await loadThreads(session.org.id, { tab, stage, q });
  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ tab, stage, q, ...patch }).filter(([, v]) => v && v !== "all") as [string, string][]);
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
          </nav>
          <form method="get" action="/app/inbox" className="bench-row" role="search">
            {tab !== "all" && <input type="hidden" name="tab" value={tab} />}
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
            {q || stage || tab !== "all" ? "No conversations match." : session.org.type === "brand" ? <>No conversations yet. <Link className="bench-link" href="/find">Find a broker</Link> and send a message.</> : "No conversations yet. Brands will appear here when they message you."}
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
