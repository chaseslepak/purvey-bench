import Link from "next/link";

const TABS = [["", "Messages"], ["brand", "Brand profile"], ["progress", "Progress"], ["toolbox", "Toolbox"], ["commissions", "Commissions"]] as const;

/**
 * Conversation title and tabs. Brands don't get the "Brand profile" tab (it's
 * their own profile; they edit it at /app/brand). `note` is a one-line muted
 * explainer under the tabs, e.g. on deal tabs before an agreement.
 */
export function ConversationHeader({ id, title, href, active, isBrand, note }: {
  id: string; title: string; href: string | null; active: "" | "brand" | "progress" | "toolbox" | "commissions"; isBrand?: boolean; note?: string | null;
}) {
  return (
    <>
      <section className="bench-section is-cream bench-stack" style={{ gap: 8 }}>
        <div className="text_title"><Link className="bench-link" href="/app/inbox">Inbox</Link></div>
        <h1 className="bench-h-section" style={{ margin: 0 }}>{href ? <Link href={href} style={{ color: "inherit" }}>{title}</Link> : title}</h1>
      </section>
      <nav className="bench-tabs" aria-label="Conversation">
        {TABS.filter(([seg]) => !(isBrand && seg === "brand" && active !== "brand")).map(([seg, label]) => (
          <Link key={seg} href={`/app/inbox/${id}${seg ? `/${seg}` : ""}`} aria-current={active === seg ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
      {note && <p className="bench-small bench-muted" style={{ margin: 0 }}>{note}</p>}
    </>
  );
}
