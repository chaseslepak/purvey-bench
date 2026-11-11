import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { InviteForm } from "./InviteForm";
import { removeTeammate, revokeInvite, setTeammateRole } from "../actions";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Team", robots: { index: false } };

export default async function Team({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string }> }) {
  const sp = await searchParams;
  const session = await getSession();
  if (!session?.org) redirect("/app/onboarding");
  const isOwner = session.org.memberRole === "owner";
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("org_members")
    .select("user_id, role, created_at, users!org_members_user_id_fkey(name, email)")
    .eq("org_id", session.org.id)
    .order("created_at");
  const { data: invites } = isOwner
    ? await supabase.from("org_invites").select("id, email, role, expires_at").eq("org_id", session.org.id).is("accepted_at", null).order("created_at")
    : { data: [] };
  // Open conversations assigned to each teammate.
  const { data: sides } = await supabase.from("conversation_sides").select("assignee_user_id").eq("org_id", session.org.id).eq("archived", false).not("assignee_user_id", "is", null);
  const assigned = new Map<string, number>();
  for (const r of sides ?? []) assigned.set(r.assignee_user_id as string, (assigned.get(r.assignee_user_id as string) ?? 0) + 1);
  const owners = (members ?? []).filter((m) => m.role === "owner").length;
  const isBrand = session.org.type === "brand";

  return (
    <section className="bench-section bench-stack">
      <div className="text_title">{session.org.name}</div>
      <h1 className="bench-h-section">Team</h1>
      <p className="bench-lede" style={{ margin: 0 }}>
        Add as many teammates as you like{isBrand ? ", free" : " at no extra cost: the $100 a month covers your whole brokerage"}. Everyone shares the {isBrand ? "briefs, saved brokers, inbox and deal rooms" : "listing, inbox, analytics and deal rooms"}. Owners {isBrand ? "invite people and manage the team" : "also manage billing and verification"}; anyone can be assigned a conversation.
      </p>
      {sp.err && <p className="bench-notice is-error" role="alert">{sp.err}</p>}
      {sp.ok && <p className="bench-notice" role="status">{sp.ok}</p>}
      <div className="bench-table-wrap">
        <table className="bench-table">
          <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Assigned</th><th scope="col"><span className="bench-sr-only">Actions</span></th></tr></thead>
          <tbody>
            {(members ?? []).map((m) => {
              const u = m.users as unknown as { name: string | null; email: string };
              const me = m.user_id === session.userId;
              const n = assigned.get(m.user_id) ?? 0;
              return (
                <tr key={m.user_id}>
                  <td>{u?.name ?? "—"}{me && <span className="bench-muted"> (you)</span>}</td>
                  <td>{u?.email}</td>
                  <td style={{ textTransform: "capitalize" }}>{m.role}</td>
                  <td>{n ? <Link className="bench-link" href={`/app/inbox?assignee=${m.user_id}`}>{n} conversation{n === 1 ? "" : "s"}</Link> : <span className="bench-muted">None</span>}</td>
                  <td>
                    <div className="bench-row" style={{ gap: 14 }}>
                      {isOwner && !(m.role === "owner" && owners === 1) && (
                        <form action={setTeammateRole}>
                          <input type="hidden" name="userId" value={m.user_id} />
                          <input type="hidden" name="role" value={m.role === "owner" ? "member" : "owner"} />
                          <button type="submit" className="bench-link-btn">{m.role === "owner" ? "Make member" : "Make owner"}</button>
                        </form>
                      )}
                      {(isOwner || me) && !(m.role === "owner" && owners === 1) && (
                        <form action={removeTeammate}>
                          <input type="hidden" name="userId" value={m.user_id} />
                          <button type="submit" className="bench-link-btn">{me ? "Leave team" : "Remove"}</button>
                        </form>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {isOwner && (
        <>
          <h2 className="bench-h-section" style={{ fontSize: "1.5rem", marginTop: 16 }}>Invite a teammate</h2>
          <InviteForm />
          {invites && invites.length > 0 && (
            <div className="bench-table-wrap">
              <table className="bench-table">
                <caption className="bench-eyebrow" style={{ textAlign: "left", padding: "12px 0" }}>Pending invites</caption>
                <thead><tr><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Expires</th><th scope="col"><span className="bench-sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {invites.map((i) => (
                    <tr key={i.id}>
                      <td>{i.email}</td>
                      <td style={{ textTransform: "capitalize" }}>{i.role}</td>
                      <td>{new Date(i.expires_at).toLocaleDateString("en-US", { dateStyle: "medium" })}</td>
                      <td>
                        <form action={revokeInvite}>
                          <input type="hidden" name="inviteId" value={i.id} />
                          <button type="submit" className="bench-link-btn">Revoke</button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </section>
  );
}
