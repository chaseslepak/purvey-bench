"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addAccount, postUpdate, setAccount, toggleThanks } from "../deal-actions";

export const STAGES = [["targeted", "Targeted"], ["pitched", "Pitched"], ["samples_sent", "Samples sent"], ["category_review", "Category review"], ["authorized", "Authorized"], ["on_shelf", "On shelf"]] as const;
const label = (s: string | null) => STAGES.find(([k]) => k === s)?.[1] ?? "—";
export type Account = { id: string; name: string; stage: string; stores: number | null; covered: boolean };
export type Update = { id: string; account: string; from: string | null; to: string; note: string; next: string | null; due: string | null; at: string; author: string; thanked: boolean };

export function Progress({ id, isBroker, otherName, accounts, updates, retailers }: {
  id: string; isBroker: boolean; otherName: string; accounts: Account[]; updates: Update[]; retailers: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ accountId: accounts[0]?.id ?? "", toStage: accounts[0]?.stage ?? "pitched", note: "", nextStep: "", due: "" });
  const [newAcct, setNewAcct] = useState({ name: "", stores: "" });
  const run = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>, after?: () => void) =>
    start(async () => { const r = await fn(); setMsg(r.error ?? r.message ?? null); if (r.ok) { after?.(); router.refresh(); } });

  return (
    <section className="bench-section bench-stack" aria-labelledby="prog-h">
      <div className="bench-row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2 id="prog-h" className="bench-h-section" style={{ fontSize: "1.75rem" }}>Account progress</h2>
          <p className="bench-muted" style={{ margin: "6px 0 0", maxWidth: "60ch" }}>
            {isBroker ? `Post an update whenever an account moves. ${otherName} sees every update and gets an email.` : `${otherName} posts every account move here. You see the same board and timeline they do.`}
          </p>
        </div>
        {isBroker && accounts.length > 0 && <button type="button" className="button w-button" onClick={() => setOpen((o) => !o)}>Post an update</button>}
      </div>
      {msg && <p className="bench-notice" role="status" style={{ margin: 0 }}>{msg}</p>}

      {isBroker && open && (
        <form className="bench-card bench-stack" onSubmit={(e) => { e.preventDefault(); run(() => postUpdate(id, form), () => { setOpen(false); setForm((f) => ({ ...f, note: "", nextStep: "", due: "" })); }); }}>
          <div className="bench-grid-2">
            <div className="bench-field"><label className="bench-label" htmlFor="u-acct">Account</label>
              <select id="u-acct" className="bench-input" value={form.accountId} onChange={(e) => setForm({ ...form, accountId: e.target.value, toStage: accounts.find((a) => a.id === e.target.value)?.stage ?? form.toStage })}>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select></div>
            <div className="bench-field"><label className="bench-label" htmlFor="u-stage">Move to stage</label>
              <select id="u-stage" className="bench-input" value={form.toStage} onChange={(e) => setForm({ ...form, toStage: e.target.value })}>
                {STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select></div>
          </div>
          <div className="bench-field"><label className="bench-label" htmlFor="u-note">What happened</label>
            <textarea id="u-note" className="bench-input" required maxLength={4000} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Met with the snacks buyer…" /></div>
          <div className="bench-grid-2">
            <div className="bench-field"><label className="bench-label" htmlFor="u-next">Next step</label><input id="u-next" className="bench-input" maxLength={300} value={form.nextStep} onChange={(e) => setForm({ ...form, nextStep: e.target.value })} /></div>
            <div className="bench-field"><label className="bench-label" htmlFor="u-due">Due</label><input id="u-due" type="date" className="bench-input" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} /></div>
          </div>
          <div className="bench-row"><button className="button w-button" type="submit" disabled={pending}>Post to {otherName}</button><button className="button bench-btn-ghost w-button" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
        </form>
      )}

      {accounts.length === 0 ? (
        <p className="bench-notice" style={{ margin: 0 }}>{isBroker ? "Add the accounts you're working for this brand to start the board." : `${otherName} hasn't added accounts yet.`}</p>
      ) : (
        <div className="bench-board" role="list" aria-label="Accounts by stage">
          {STAGES.map(([k, l]) => {
            const items = accounts.filter((a) => a.stage === k);
            return (
              <div key={k} className="bench-board_col" role="listitem">
                <h3><span>{l}</span><span>{items.length}</span></h3>
                {items.map((a) => (
                  <div key={a.id} className="bench-board_card">
                    <b>{a.name}</b>
                    <span className="bench-muted">{a.stores != null ? `${a.stores} stores` : ""}{a.covered ? "" : " · not in commission"}</span>
                    {isBroker && (
                      <label className="bench-row bench-small" style={{ gap: 6, marginTop: 6 }}>
                        <input type="checkbox" checked={a.covered} onChange={(e) => run(() => setAccount(id, a.id, { covered: e.target.checked }))} /> Commissionable
                      </label>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {isBroker && (
        <form className="bench-retailer-add" onSubmit={(e) => {
          e.preventDefault();
          const m = retailers.find((r) => r.name.toLowerCase() === newAcct.name.trim().toLowerCase());
          run(() => addAccount(id, { retailerId: m?.id ?? null, customName: m ? null : newAcct.name.trim(), stores: newAcct.stores ? Number(newAcct.stores) : null }), () => setNewAcct({ name: "", stores: "" }));
        }}>
          <div className="bench-field"><label className="bench-label" htmlFor="acct-name">Add an account</label>
            <input id="acct-name" className="bench-input" list="acct-list" value={newAcct.name} onChange={(e) => setNewAcct({ ...newAcct, name: e.target.value })} placeholder="e.g. Kroger Central" required />
            <datalist id="acct-list">{retailers.map((r) => <option key={r.id} value={r.name} />)}</datalist></div>
          <div className="bench-field"><label className="bench-label" htmlFor="acct-stores">Stores</label><input id="acct-stores" className="bench-input" inputMode="numeric" value={newAcct.stores} onChange={(e) => setNewAcct({ ...newAcct, stores: e.target.value.replace(/\D/g, "") })} /></div>
          <button className="button bench-btn-ghost w-button" type="submit" disabled={pending}>Add</button>
        </form>
      )}

      <h3 className="bench-h-section" style={{ fontSize: "1.375rem", marginTop: 12 }}>Updates</h3>
      {updates.length === 0 ? <p className="bench-muted" style={{ margin: 0 }}>No updates yet.</p> : (
        <ol className="bench-timeline">
          {updates.map((u) => (
            <li key={u.id}>
              <time className="bench-small bench-muted" dateTime={u.at}>{new Date(u.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</time>
              <div style={{ minWidth: 0 }}>
                <div className="bench-small bench-muted">{u.author}</div>
                <h4 style={{ margin: "4px 0", fontWeight: 500, fontSize: "1rem" }}>{u.account} <span className="bench-muted">{label(u.from)} →</span> <span className={`bench-tag ${u.to === "authorized" || u.to === "on_shelf" ? "is-blue" : "is-mist"}`}>{label(u.to)}</span></h4>
                <p style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>{u.note}</p>
                {u.next && <div className="bench-next"><strong>Next:</strong> {u.next}{u.due ? ` · due ${new Date(u.due + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</div>}
                <div className="bench-row" style={{ gap: 8, marginTop: 8 }}>
                  {isBroker ? (u.thanked && <span className="bench-tag is-mist">{otherName} said thanks</span>) : (
                    <>
                      <button type="button" className="bench-chip" aria-pressed={u.thanked} onClick={() => run(() => toggleThanks(id, u.id))}>{u.thanked ? "Thanked" : "Thanks"}</button>
                      <Link className="bench-chip" href={`/app/inbox/${id}`}>Reply in messages</Link>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
