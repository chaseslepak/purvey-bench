import type { Metadata } from "next";
import Link from "next/link";
import { sendLoginLink, setOwner, setTempPassword, setUpAccount } from "./actions";
import { Flash, type FlashParams } from "../Flash";
import { fmtDate, fmtDateTime, requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata: Metadata = { title: "Accounts" };

type Member = { role: string; user_id: string; users: { name: string | null; email: string } | null };

/** Purvey sets up brands and brokers by hand and emails the owner a link to sign in and verify. */
export default async function Accounts({ searchParams }: { searchParams: FlashParams }) {
  const sp = await searchParams;
  const { db } = await requireAdmin();
  const admin = createAdminClient();
  const [{ data: orgs }, { data: au }] = await Promise.all([
    db.from("organizations").select("id, type, name, created_at, org_members(role, user_id, users!org_members_user_id_fkey(name, email))").order("created_at", { ascending: false }).limit(300),
    admin.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  const authOf = new Map((au?.users ?? []).map((u) => [u.id, u]));

  return (
    <div className="bench-stack">
      <section className="bench-section bench-stack">
        <Flash sp={sp} />
        <h1 className="bench-h-section" style={{ fontSize: "1.75rem" }}>Set up an account</h1>
        <p className="bench-muted" style={{ margin: 0 }}>
          Create a brand or brokerage for someone, then email them a link that signs them in and verifies their email in one click. Owners can also sign in with a password: set a temporary one on their row, or they can add their own in Settings.
          Leave the owner&rsquo;s email blank to build the profile first and add them later. For a brand&rsquo;s full profile and products in one go, use the{" "}
          <Link className="bench-link" href="/admin/brands/setup">brand spec importer</Link>.
        </p>
        <form action={setUpAccount} className="bench-stack">
          <fieldset className="bench-field" style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="bench-label" style={{ marginBottom: 8 }}>Type</legend>
            <div className="bench-row">
              <label className="bench-row" style={{ gap: 6 }}><input type="radio" name="type" value="brand" defaultChecked /> Brand</label>
              <label className="bench-row" style={{ gap: 6 }}><input type="radio" name="type" value="broker" /> Brokerage</label>
            </div>
          </fieldset>
          <div className="bench-grid-2">
            <div className="bench-field"><label className="bench-label" htmlFor="a-name">Company name</label><input id="a-name" name="name" className="bench-input" required maxLength={120} /></div>
            <div className="bench-field"><label className="bench-label" htmlFor="a-web">Website</label><input id="a-web" name="website" className="bench-input" placeholder="example.com" /></div>
            <div className="bench-field"><label className="bench-label" htmlFor="a-city">HQ city</label><input id="a-city" name="hqCity" className="bench-input" /></div>
            <div className="bench-field"><label className="bench-label" htmlFor="a-state">HQ state</label><input id="a-state" name="hqState" className="bench-input" maxLength={2} placeholder="IL" /></div>
          </div>
          <h2 className="bench-label" style={{ margin: "8px 0 0" }}>Owner</h2>
          <div className="bench-grid-3">
            <div className="bench-field"><label className="bench-label" htmlFor="a-oname">Name</label><input id="a-oname" name="ownerName" className="bench-input" /></div>
            <div className="bench-field"><label className="bench-label" htmlFor="a-oemail">Email</label><input id="a-oemail" name="ownerEmail" type="email" className="bench-input" /></div>
            <div className="bench-field"><label className="bench-label" htmlFor="a-ophone">Phone</label><input id="a-ophone" name="ownerPhone" className="bench-input" /></div>
          </div>
          <div className="bench-field"><label className="bench-label" htmlFor="a-about">About</label><textarea id="a-about" name="about" className="bench-input" maxLength={2000} placeholder="What they make or sell, where, and to whom." /></div>
          <details className="bench-card bench-stack" style={{ padding: 20 }}>
            <summary className="bench-label" style={{ cursor: "pointer" }}>Brokerage details (optional)</summary>
            <p className="bench-small bench-muted" style={{ margin: "8px 0" }}>Comma-separated. Names not on Bench&rsquo;s lists are kept as typed. Retailers are added as weekly calls; the broker can adjust.</p>
            <div className="bench-grid-2">
              <div className="bench-field"><label className="bench-label" htmlFor="a-states">States</label><input id="a-states" name="states" className="bench-input" placeholder="IL, WI, IN" /></div>
              <div className="bench-field"><label className="bench-label" htmlFor="a-ret">Retailers</label><input id="a-ret" name="retailers" className="bench-input" placeholder="Kroger, Meijer, Jewel-Osco" /></div>
              <div className="bench-field"><label className="bench-label" htmlFor="a-chan">Channels</label><input id="a-chan" name="channels" className="bench-input" placeholder="Conventional grocery, Natural & specialty" /></div>
              <div className="bench-field"><label className="bench-label" htmlFor="a-dist">Distributors</label><input id="a-dist" name="distributors" className="bench-input" placeholder="KeHE, UNFI" /></div>
              <div className="bench-field"><label className="bench-label" htmlFor="a-cat">Categories</label><input id="a-cat" name="categories" className="bench-input" placeholder="Salty snacks" /></div>
            </div>
            <label className="bench-row bench-small" style={{ gap: 8 }}><input type="checkbox" name="publish" value="1" /> Publish the listing now (needs about, owner, a state and 3+ retailers)</label>
          </details>
          <label className="bench-row" style={{ gap: 8 }}><input type="checkbox" name="send" value="1" /> Email the owner their sign-in link now</label>
          <div className="bench-field"><label className="bench-label" htmlFor="a-note">Personal note in the email (optional)</label><input id="a-note" name="note" className="bench-input" maxLength={600} placeholder="Great talking today — here's your Bench account." /></div>
          <div><button type="submit" className="button w-button">Set up account</button></div>
        </form>
      </section>

      <section className="bench-section bench-stack" aria-labelledby="acc-list">
        <h2 id="acc-list" className="bench-h-section" style={{ fontSize: "1.5rem" }}>Accounts</h2>
        <div className="bench-table-wrap">
          <table className="bench-table">
            <thead><tr><th scope="col">Organization</th><th scope="col">Owner</th><th scope="col">Sign-in link</th><th scope="col">Signed in</th><th scope="col"><span className="bench-sr-only">Actions</span></th></tr></thead>
            <tbody>
              {(orgs ?? []).map((o) => {
                const owner = ((o.org_members ?? []) as unknown as Member[]).find((m) => m.role === "owner");
                const u = owner ? authOf.get(owner.user_id) : undefined;
                const meta = (u?.app_metadata ?? {}) as { welcome_sent_at?: string; welcome_used_at?: string };
                return (
                  <tr key={o.id}>
                    <td>{o.type === "brand" ? <Link className="bench-link" href={`/admin/brands/${o.id}`}>{o.name}</Link> : o.name}<div className="bench-small bench-muted">{o.type === "broker" ? "Brokerage" : "Brand"} · added {fmtDate(o.created_at)}</div></td>
                    <td className="bench-small">
                      {owner?.users ? <>{owner.users.name ?? "—"}<br />{owner.users.email}</> : (
                        <form action={setOwner} className="bench-stack" style={{ gap: 6 }}>
                          <input type="hidden" name="orgId" value={o.id} />
                          <label className="bench-sr-only" htmlFor={`on-${o.id}`}>Owner name</label>
                          <input id={`on-${o.id}`} name="name" className="bench-input" placeholder="Owner name" style={{ minHeight: 36 }} />
                          <label className="bench-sr-only" htmlFor={`oe-${o.id}`}>Owner email</label>
                          <input id={`oe-${o.id}`} name="email" type="email" required className="bench-input" placeholder="owner@company.com" style={{ minHeight: 36 }} />
                          <label className="bench-row" style={{ gap: 6 }}><input type="checkbox" name="send" value="1" /> Send link</label>
                          <button type="submit" className="bench-link-btn" style={{ textAlign: "left" }}>Add owner</button>
                        </form>
                      )}
                    </td>
                    <td className="bench-small">{meta.welcome_used_at ? `Used ${fmtDateTime(meta.welcome_used_at)}` : meta.welcome_sent_at ? `Sent ${fmtDateTime(meta.welcome_sent_at)}` : "Not sent"}</td>
                    <td className="bench-small">{u?.last_sign_in_at ? fmtDateTime(u.last_sign_in_at) : "Never"}</td>
                    <td>
                      {owner?.users && (
                        <form action={sendLoginLink}>
                          <input type="hidden" name="orgId" value={o.id} />
                          <button type="submit" className="bench-link-btn">{meta.welcome_sent_at ? "Resend sign-in link" : "Send sign-in link"}</button>
                        </form>
                      )}
                      {owner?.users && (
                        <details className="bench-small" style={{ marginTop: 6 }}>
                          <summary className="bench-link-btn" style={{ listStyle: "none" }}>Set a password</summary>
                          <form action={setTempPassword} className="bench-stack" style={{ gap: 6, marginTop: 6 }}>
                            <input type="hidden" name="orgId" value={o.id} />
                            <label className="bench-sr-only" htmlFor={`pw-${o.id}`}>Temporary password for {owner.users.email}</label>
                            <input id={`pw-${o.id}`} name="password" type="text" autoComplete="off" minLength={8} required className="bench-input" placeholder="At least 8 characters" style={{ minHeight: 36 }} />
                            <button type="submit" className="bench-link-btn" style={{ textAlign: "left" }}>Save password</button>
                          </form>
                        </details>
                      )}
                      {o.type === "broker" && <Link className="bench-link bench-small" href="/admin/listings">Listing</Link>}
                    </td>
                  </tr>
                );
              })}
              {!orgs?.length && <tr><td colSpan={5} className="bench-muted">No accounts yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
