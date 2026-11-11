import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { deleteTemplate } from "./actions";
import { ConfirmSubmit } from "@/components/ui/ConfirmSubmit";
import { AwayForm, NotificationsForm, ProfileForm, TemplateForm } from "./Forms";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Settings", robots: { index: false } };

export default async function Settings() {
  const session = await getSession();
  if (!session?.org) redirect("/app/onboarding");
  const db = await createClient();
  const isBroker = session.org.type === "broker";
  const [{ data: me }, { data: prefs }, { data: templates }, listing] = await Promise.all([
    db.from("users").select("name, phone").eq("id", session.userId).single(),
    db.from("notification_prefs").select("email_new_message, email_weekly_summary").eq("user_id", session.userId).maybeSingle(),
    db.from("message_templates").select("id, title, body").order("title"),
    isBroker ? db.from("broker_listings").select("away_message, not_taking_new_lines").eq("org_id", session.org.id).single() : Promise.resolve({ data: null }),
  ]);
  return (
    <>
      <section className="bench-section is-cream bench-stack">
        <div className="text_title">{session.org.name}</div>
        <h1 className="bench-h-section">Settings</h1>
      </section>
      <section className="bench-section bench-stack" aria-labelledby="s-profile"><h2 id="s-profile" className="bench-h-section" style={{ fontSize: "1.5rem" }}>Your details</h2><ProfileForm name={me?.name ?? ""} phone={me?.phone ?? ""} email={session.email} /></section>
      <section className="bench-section bench-stack" aria-labelledby="s-email"><h2 id="s-email" className="bench-h-section" style={{ fontSize: "1.5rem" }}>Email</h2><NotificationsForm freq={prefs?.email_new_message ?? "instant"} weekly={prefs?.email_weekly_summary ?? true} isBroker={isBroker} /></section>
      {isBroker && listing.data && (
        <section className="bench-section bench-stack" aria-labelledby="s-away"><h2 id="s-away" className="bench-h-section" style={{ fontSize: "1.5rem" }}>Away mode</h2><AwayForm message={listing.data.away_message ?? ""} notTaking={listing.data.not_taking_new_lines} /></section>
      )}
      <section className="bench-section bench-stack" aria-labelledby="s-tpl">
        <h2 id="s-tpl" className="bench-h-section" style={{ fontSize: "1.5rem" }}>Saved replies</h2>
        <p className="bench-hint" style={{ margin: 0 }}>Shared with your team. Insert them from any conversation.</p>
        {templates && templates.length > 0 && (
          <ul className="bench-plainlist" style={{ gap: 10 }}>
            {templates.map((t) => (
              <li key={t.id} className="bench-card" style={{ padding: 16 }}>
                <div className="bench-row" style={{ justifyContent: "space-between" }}><strong>{t.title}</strong>
                  <form action={deleteTemplate}><input type="hidden" name="id" value={t.id} /><ConfirmSubmit message={`Delete the saved reply "${t.title}"?`} aria-label={`Delete ${t.title}`}>Delete</ConfirmSubmit></form>
                </div>
                <p className="bench-small" style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{t.body}</p>
              </li>
            ))}
          </ul>
        )}
        <TemplateForm />
      </section>
    </>
  );
}
