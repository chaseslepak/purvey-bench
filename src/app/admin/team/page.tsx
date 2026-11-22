import type { Metadata } from "next";
import { addAdmin } from "./actions";
import { Flash, type FlashParams } from "../Flash";
import { fmtDate, requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Admin team" };

/** Purvey teammates who can use Bench admin. */
export default async function AdminTeam({ searchParams }: { searchParams: FlashParams }) {
  const sp = await searchParams;
  await requireAdmin();
  const db = createAdminClient();
  const [{ data: list }, { data: admins }] = await Promise.all([
    db.from("admin_allowlist").select("email, added_at").order("added_at"),
    db.from("users").select("email").eq("is_admin", true),
  ]);
  const active = new Set((admins ?? []).map((a) => a.email.toLowerCase()));
  const emails = [...new Set([...(list ?? []).map((l) => l.email), ...active])].sort();
  const added = new Map((list ?? []).map((l) => [l.email, l.added_at as string]));
  return (
    <section className="bench-section bench-stack">
      <Flash sp={sp} />
      <h1 className="bench-h-section" style={{ fontSize: "1.75rem" }}>Admin team</h1>
      <p className="bench-muted" style={{ margin: 0 }}>Purvey teammates who can use Bench admin. Add a @purveycpg.com address; they sign in at bench.purveycpg.com/sign-in with it (email link or Google) and see the Admin menu.</p>
      <form action={addAdmin} className="bench-row">
        <label className="bench-sr-only" htmlFor="admin-email">Email</label>
        <input id="admin-email" name="email" type="email" required className="bench-input" placeholder="name@purveycpg.com" style={{ maxWidth: 320 }} />
        <button type="submit" className="button is-small w-button">Add admin</button>
      </form>
      <div className="bench-table-wrap">
        <table className="bench-table">
          <thead><tr><th scope="col">Email</th><th scope="col">Status</th><th scope="col">Added</th></tr></thead>
          <tbody>
            {emails.map((e) => (
              <tr key={e}><td>{e}</td><td>{active.has(e) ? "Admin" : "Will be admin at first sign-in"}</td><td>{fmtDate(added.get(e))}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
