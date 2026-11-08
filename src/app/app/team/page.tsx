import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { InviteForm } from "./InviteForm";
import { removeTeammate, revokeInvite } from "../actions";
import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Team", robots: { index: false } };

export default async function Team() {
  const session = await getSession();
  if (!session?.org) redirect("/app/onboarding");
  const isOwner = session.org.memberRole === "owner";
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("org_members")
    .select("user_id, role, created_at, users(name, email)")
    .eq("org_id", session.org.id)
    .order("created_at");
  const { data: invites } = isOwner
    ? await supabase.from("org_invites").select("id, email, role, expires_at").eq("org_id", session.org.id).is("accepted_at", null).order("created_at")
    : { data: [] };

  return (
    <section className="bench-section bench-stack">
      <div className="text_title">{session.org.name}</div>
      <h1 className="bench-h-section">Team</h1>
      <div className="bench-table-wrap">
        <table className="bench-table">
          <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th>{isOwner && <th scope="col"><span className="bench-sr-only">Actions</span></th>}</tr></thead>
          <tbody>
            {(members ?? []).map((m) => {
              const u = m.users as unknown as { name: string | null; email: string };
              return (
                <tr key={m.user_id}>
                  <td>{u?.name ?? "—"}{m.user_id === session.userId && <span className="bench-muted"> (you)</span>}</td>
                  <td>{u?.email}</td>
                  <td style={{ textTransform: "capitalize" }}>{m.role}</td>
                  {isOwner && (
                    <td>
                      {m.user_id !== session.userId && (
                        <form action={removeTeammate}>
                          <input type="hidden" name="userId" value={m.user_id} />
                          <button type="submit" className="bench-link-btn">Remove</button>
                        </form>
                      )}
                    </td>
                  )}
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
