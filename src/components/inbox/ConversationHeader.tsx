import Link from "next/link";

const TABS = [["", "Messages"], ["brand", "Brand"], ["progress", "Progress"], ["toolbox", "Toolbox"], ["commissions", "Commissions"]] as const;

export function ConversationHeader({ id, title, href, active }: { id: string; title: string; href: string | null; active: "" | "brand" | "progress" | "toolbox" | "commissions" }) {
  return (
    <>
      <section className="bench-section is-cream bench-stack" style={{ gap: 8 }}>
        <div className="text_title"><Link className="bench-link" href="/app/inbox">Inbox</Link></div>
        <h1 className="bench-h-section" style={{ margin: 0 }}>{href ? <Link href={href} style={{ color: "inherit" }}>{title}</Link> : title}</h1>
      </section>
      <nav className="bench-tabs" aria-label="Conversation">
        {TABS.map(([seg, label]) => (
          <Link key={seg} href={`/app/inbox/${id}${seg ? `/${seg}` : ""}`} aria-current={active === seg ? "page" : undefined}>{label}</Link>
        ))}
      </nav>
    </>
  );
}
