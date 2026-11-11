import { updateBrandReference } from "./actions";
import type { createClient } from "@/lib/supabase/server";

type Db = Awaited<ReturnType<typeof createClient>>;

/** References offered by brands that worked with this broker (Purvey only). */
export async function BrandRefs({ db, listingId, back }: { db: Db; listingId: string; back: string }) {
  const { data } = await db.from("brand_references")
    .select("id, contact_name, contact_email, contact_phone, note, status, admin_notes, created_at, brand:organizations!brand_references_brand_org_id_fkey(name)")
    .eq("listing_id", listingId).order("created_at");
  return (
    <>
      <h3 className="bench-h-section" style={{ fontSize: "1.5rem" }}>References from brands <span className="bench-small bench-muted">(offered on Bench, Purvey only)</span></h3>
      <div className="bench-table-wrap">
        <table className="bench-table">
          <thead><tr><th scope="col">Brand and contact</th><th scope="col">Reach them</th><th scope="col">Result</th></tr></thead>
          <tbody>
            {(data ?? []).map((r) => (
              <tr key={r.id}>
                <td>{(r.brand as unknown as { name: string } | null)?.name ?? "—"}<div className="bench-small bench-muted">{r.contact_name}{r.note ? ` · “${r.note}”` : ""}</div></td>
                <td className="bench-small">{r.contact_email ? <a className="bench-link" href={`mailto:${r.contact_email}`}>{r.contact_email}</a> : "—"}<br />{r.contact_phone ?? ""}</td>
                <td>
                  <form action={updateBrandReference} className="bench-row" style={{ alignItems: "flex-end" }}>
                    <input type="hidden" name="refId" value={r.id} /><input type="hidden" name="back" value={back} />
                    <label className="bench-sr-only" htmlFor={`brs-${r.id}`}>Result for {r.contact_name}</label>
                    <select id={`brs-${r.id}`} name="status" className="bench-input" defaultValue={r.status} style={{ maxWidth: 160 }}>
                      {["pending", "reached", "confirmed", "unreachable"].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                    </select>
                    <label className="bench-sr-only" htmlFor={`brn-${r.id}`}>Notes for {r.contact_name}</label>
                    <input id={`brn-${r.id}`} name="notes" className="bench-input" defaultValue={r.admin_notes ?? ""} placeholder="What they said" style={{ maxWidth: 260 }} />
                    <button type="submit" className="bench-link-btn">Save</button>
                  </form>
                </td>
              </tr>
            ))}
            {!data?.length && <tr><td colSpan={3} className="bench-muted">No brand has offered a reference yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
