import type { Metadata } from "next";
import Link from "next/link";
import { addListItem, mergeListItem, renameListItem } from "../actions";
import { Flash, type FlashParams } from "../Flash";
import { requireAdmin } from "@/lib/admin";

export const metadata: Metadata = { title: "Reference lists" };

const LISTS = [["retailers", "Retailers"], ["distributors", "Distributors"], ["categories", "Categories"], ["channels", "Channels"]] as const;

export default async function AdminLists({ searchParams }: { searchParams: FlashParams }) {
  const sp = await searchParams;
  const { db } = await requireAdmin();
  const list = LISTS.find(([k]) => k === sp.list)?.[0] ?? "retailers";
  const { data } = await db.from(list).select("id, name, active, merged_into").order("name");
  const items = data ?? [];
  const active = items.filter((i) => i.active);
  const merged = items.filter((i) => !i.active);
  const nameOf = (id: number | null) => items.find((i) => i.id === id)?.name ?? "—";

  return (
    <section className="bench-section bench-stack">
      <Flash sp={sp} />
      <div className="bench-row">
        {LISTS.map(([k, label], i) => (
          <span key={k} className="bench-row" style={{ gap: 12 }}>
            {i > 0 && <span aria-hidden="true">·</span>}
            <Link className="bench-link" href={`/admin/lists?list=${k}`} aria-current={k === list ? "page" : undefined} style={k === list ? { fontWeight: 600 } : undefined}>{label}</Link>
          </span>
        ))}
      </div>
      <p className="bench-small bench-muted" style={{ margin: 0 }}>
        Merging moves every listing, brief and brand profile from one item to another, then retires the duplicate. Renames show everywhere at once.
      </p>

      <form action={addListItem} className="bench-row" style={{ alignItems: "flex-end" }}>
        <input type="hidden" name="list" value={list} />
        <div className="bench-field" style={{ flex: "1 1 260px" }}><label className="bench-label" htmlFor="add">Add to {list}</label><input id="add" name="name" className="bench-input" maxLength={120} required /></div>
        <button type="submit" className="button is-small w-button">Add</button>
      </form>

      <div className="bench-table-wrap">
        <table className="bench-table">
          <thead><tr><th scope="col">Name</th><th scope="col">Rename</th><th scope="col">Merge into</th></tr></thead>
          <tbody>
            {active.map((i) => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td>
                  <form action={renameListItem} className="bench-row" style={{ gap: 6 }}>
                    <input type="hidden" name="list" value={list} /><input type="hidden" name="id" value={i.id} />
                    <label className="bench-sr-only" htmlFor={`rn-${i.id}`}>New name for {i.name}</label>
                    <input id={`rn-${i.id}`} name="name" className="bench-input" defaultValue={i.name} maxLength={120} required style={{ maxWidth: 220, height: 36, minHeight: 0 }} />
                    <button type="submit" className="bench-link-btn">Rename</button>
                  </form>
                </td>
                <td>
                  <form action={mergeListItem} className="bench-row" style={{ gap: 6 }}>
                    <input type="hidden" name="list" value={list} /><input type="hidden" name="from" value={i.id} />
                    <label className="bench-sr-only" htmlFor={`mg-${i.id}`}>Merge {i.name} into</label>
                    <select id={`mg-${i.id}`} name="into" className="bench-input" defaultValue="" style={{ maxWidth: 220, height: 36, minHeight: 0, padding: "4px 8px" }}>
                      <option value="">Choose…</option>
                      {active.filter((o) => o.id !== i.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                    </select>
                    <button type="submit" className="bench-link-btn">Merge</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {merged.length > 0 && (
        <details className="bench-accordion">
          <summary>Retired ({merged.length})</summary>
          <ul className="bench-accordion_body bench-small">
            {merged.map((i) => <li key={i.id}>{i.name} → {nameOf(i.merged_into)}</li>)}
          </ul>
        </details>
      )}
    </section>
  );
}
