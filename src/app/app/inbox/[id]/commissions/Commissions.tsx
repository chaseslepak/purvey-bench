"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/browser";
import { editTrueUp, issueInvoice, markPaid, questionInvoice, saveTerms, uploadSalesReport } from "../deal-actions";

type Line = { account: string; distributor: string; units: number; gross: number; deductions: number; covered: boolean };
type Adj = { label: string; amount: number };
export type Period = {
  id: string; period: string; status: "needed" | "report" | "invoiced" | "questioned" | "paid"; reportName: string | null; lines: Line[]; adjustments: Adj[];
  invoiceNo: string | null; invoiceDate: string | null; dueDate: string | null; totals: Record<string, number> | null; preview: Record<string, number>;
  questioned: string | null; paid: { date: string; method: string; ref: string | null } | null;
};
export type Terms = { rate: number; retainer: number; retainerFrom: string | null; retainerTo: string | null; dueDays: number; notes: string | null } | null;

const usd = (n: number) => `$${(n ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthName = (iso: string) => new Date(iso + "T12:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
const STATUS: Record<Period["status"], [string, string]> = {
  needed: ["Report needed", ""], report: ["Ready to invoice", "is-mist"], invoiced: ["Invoiced", "is-blue"], questioned: ["Questioned", ""], paid: ["Paid outside Bench", "is-mist"],
};

export function Commissions({ id, isBrand, otherName, myName, terms, periods }: { id: string; isBrand: boolean; otherName: string; myName: string; terms: Terms; periods: Period[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(periods[0]?.id ?? null);
  const p = periods.find((x) => x.id === sel) ?? periods[0] ?? null; // newest month until one is picked
  const brokerName = isBrand ? otherName : myName;
  const brandName = isBrand ? myName : otherName;
  const run = (fn: () => Promise<{ ok?: boolean; error?: string; message?: string }>) => start(async () => { const r = await fn(); setMsg(r.error ?? r.message ?? null); if (r.ok) router.refresh(); });

  // ----- terms -----
  const [t, setT] = useState({ rate: String(terms?.rate ?? ""), retainer: String(terms?.retainer ?? "0"), retainerFrom: terms?.retainerFrom ?? "", retainerTo: terms?.retainerTo ?? "", dueDays: String(terms?.dueDays ?? 30), notes: terms?.notes ?? "" });
  // ----- report upload (brand) -----
  const lastMonth = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 7); })();
  const [month, setMonth] = useState(lastMonth);
  const [dist, setDist] = useState("UNFI");
  async function uploadReport(file: File | undefined) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) return setMsg("Upload the report as a CSV. In UNFI or KeHE, export the sales report to CSV.");
    const path = `${id}/${crypto.randomUUID()}.csv`;
    const { error } = await createClient().storage.from("toolbox").upload(path, file, { contentType: "text/csv" });
    if (error) return setMsg("Upload failed. Try again.");
    run(() => uploadSalesReport(id, { month, path, name: file.name.slice(0, 200), mime: "text/csv", distributor: dist }));
  }
  // ----- broker edit -----
  const [adj, setAdj] = useState({ label: "", amount: "" });
  // Coverage ticks update instantly, then save.
  const [cover, setCover] = useState<Record<string, boolean>>({});
  const covered = (i: number) => (p ? cover[`${p.id}:${i}`] ?? p.lines[i].covered : false);
  const linesWithCover = () => (p ? p.lines.map((x, j) => ({ ...x, covered: covered(j) })) : []);
  // ----- brand pay/question -----
  const [pay, setPay] = useState({ date: new Date().toISOString().slice(0, 10), method: "ACH", ref: "" });
  const [question, setQuestion] = useState("");
  // Frozen totals only once invoiced or paid; while revising, the live recalculation.
  const totals = p ? (p.status === "invoiced" || p.status === "paid" ? p.totals ?? p.preview : p.preview) : null;

  return (
    <div className="bench-builder_grid">
      <section className="bench-section bench-stack" aria-labelledby="tu-h">
        <div>
          <h2 id="tu-h" className="bench-h-section" style={{ fontSize: "1.75rem" }}>Commission true-up</h2>
          <p className="bench-muted" style={{ margin: "6px 0 0", maxWidth: "64ch" }}>Each month {brandName} uploads its sales report, Bench applies the agreed terms, and {brokerName} invoices from the result. Payment happens outside Bench; {brandName} marks the invoice paid here so both sides have the same record.</p>
        </div>
        {msg && <p className="bench-notice" role="status" style={{ margin: 0 }}>{msg}</p>}

        {isBrand && (
          <div className="bench-card bench-stack" style={{ gap: 12 }}>
            <h3 className="bench-eyebrow" style={{ margin: 0 }}>Upload a sales report</h3>
            <div className="bench-row">
              <div className="bench-field"><label className="bench-label" htmlFor="tu-month">Month</label><input id="tu-month" type="month" className="bench-input" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
              <div className="bench-field"><label className="bench-label" htmlFor="tu-dist">Source</label>
                <select id="tu-dist" className="bench-input" value={dist} onChange={(e) => setDist(e.target.value)}>{["UNFI", "KeHE", "Retailer portal", "Other"].map((d) => <option key={d}>{d}</option>)}</select></div>
              <label className="button w-button" style={{ cursor: "pointer", alignSelf: "end" }}>{pending ? "Reading…" : "Upload CSV"}
                <input type="file" accept=".csv,text/csv" className="bench-sr-only" onChange={(e) => { void uploadReport(e.target.files?.[0]); e.target.value = ""; }} /></label>
            </div>
            <p className="bench-hint" style={{ margin: 0 }}>Bench finds the customer, units, sales and deduction columns, adds up each account, and marks the accounts in this partnership. The original file is kept in the Toolbox under Reports.</p>
          </div>
        )}

        {!p ? <p className="bench-notice" style={{ margin: 0 }}>{isBrand ? "Upload last month's sales report to start the first true-up." : `Waiting for ${brandName} to upload a sales report.`}</p> : (
          <div className="bench-stack">
            <div className="bench-row" style={{ justifyContent: "space-between" }}>
              <h3 className="bench-h-section" style={{ fontSize: "1.375rem", margin: 0 }}>{monthName(p.period)}</h3>
              <span className={`bench-tag ${STATUS[p.status][1]}`}>{STATUS[p.status][0]}</span>
            </div>
            {p.reportName && <p className="bench-small bench-muted" style={{ margin: 0 }}>From {p.reportName}</p>}
            <div className="bench-table-wrap">
              <table className="bench-table">
                <thead><tr><th scope="col">Account</th><th scope="col">Source</th><th scope="col">Units</th><th scope="col">Gross</th><th scope="col">Deductions</th><th scope="col">Net</th><th scope="col">Commission?</th></tr></thead>
                <tbody>
                  {p.lines.map((l, i) => (
                    <tr key={i} style={covered(i) ? undefined : { color: "var(--pv-muted)" }}>
                      <td>{l.account}</td><td>{l.distributor}</td><td>{l.units.toLocaleString("en-US")}</td><td>{usd(l.gross)}</td><td>−{usd(l.deductions)}</td><td>{usd(l.gross - l.deductions)}</td>
                      <td>{!isBrand && (p.status === "report" || p.status === "questioned") ? (
                        <label className="bench-row bench-small" style={{ gap: 6 }}><input type="checkbox" checked={covered(i)} onChange={(e) => { const v = e.target.checked; setCover((c) => ({ ...c, [`${p.id}:${i}`]: v })); const next = linesWithCover().map((x, j) => (j === i ? { ...x, covered: v } : x)); run(() => editTrueUp(id, p.id, next, p.adjustments)); }} /> Covered</label>
                      ) : covered(i) ? "Covered" : "Not covered"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totals && (
              <table className="bench-table" aria-label="Terms applied">
                <tbody>
                  <tr><td>Commission · {terms?.rate ?? 0}% of covered net sales ({usd(totals.covered_net)})</td><td style={{ textAlign: "right" }}>{usd(totals.commission)}</td></tr>
                  {totals.retainer > 0 && <tr><td>Monthly retainer</td><td style={{ textAlign: "right" }}>{usd(totals.retainer)}</td></tr>}
                  {p.adjustments.map((a, i) => <tr key={i}><td>Adjustment · {a.label}{!isBrand && p.status !== "invoiced" && p.status !== "paid" && <> <button type="button" className="bench-link-btn" onClick={() => run(() => editTrueUp(id, p.id, linesWithCover(), p.adjustments.filter((_, j) => j !== i)))}>Remove</button></>}</td><td style={{ textAlign: "right" }}>{usd(a.amount)}</td></tr>)}
                  <tr><th scope="row" style={{ textAlign: "left" }}>Amount due to {brokerName}</th><th style={{ textAlign: "right" }}>{usd(totals.total)}</th></tr>
                </tbody>
              </table>
            )}

            {!isBrand && (p.status === "report" || p.status === "questioned") && (
              <>
                {p.status === "questioned" && <p className="bench-notice is-warn" style={{ margin: 0 }}>{brandName} asked: “{p.questioned}”. Adjust and re-send the invoice, or reply in Messages.</p>}
                <form className="bench-retailer-add" onSubmit={(e) => { e.preventDefault(); const amount = Number(adj.amount); if (!adj.label.trim() || !Number.isFinite(amount)) return; run(() => editTrueUp(id, p.id, linesWithCover(), [...p.adjustments, { label: adj.label.trim(), amount }])); setAdj({ label: "", amount: "" }); }}>
                  <div className="bench-field"><label className="bench-label" htmlFor="adj-label">Adjustment</label><input id="adj-label" className="bench-input" value={adj.label} maxLength={120} placeholder="e.g. Credit for spoils chargeback" onChange={(e) => setAdj({ ...adj, label: e.target.value })} /></div>
                  <div className="bench-field"><label className="bench-label" htmlFor="adj-amount">Amount ($, minus for a credit)</label><input id="adj-amount" className="bench-input" inputMode="decimal" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} /></div>
                  <button className="button bench-btn-ghost w-button" type="submit">Add</button>
                </form>
                <div><button type="button" className="button w-button" disabled={pending || !terms} onClick={() => run(() => issueInvoice(id, p.id))}>Create and send invoice · {usd(totals?.total ?? 0)}</button></div>
                {!terms && <p className="bench-hint" style={{ margin: 0 }}>Record the agreed terms first.</p>}
              </>
            )}

            {(p.status === "invoiced" || p.status === "paid") && p.totals && (
              <div className="bench-invoice">
                <div className="bench-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div><div className="bench-eyebrow" style={{ fontSize: 11 }}>Invoice</div><div className="bench-h-section" style={{ fontSize: "1.5rem" }}>{p.invoiceNo}</div>
                    <div className="bench-small">From <strong>{brokerName}</strong> · Bill to <strong>{brandName}</strong></div></div>
                  <dl className="bench-dl bench-small"><dt>Period</dt><dd>{monthName(p.period)}</dd><dt>Issued</dt><dd>{p.invoiceDate}</dd><dt>Due</dt><dd>{p.dueDate}</dd></dl>
                </div>
                <p className="bench-small bench-muted" style={{ margin: "12px 0 0" }}>Total due {usd(p.totals.total)}. Pay outside Bench by ACH or check to the remittance details {brokerName} provided. Bench records the invoice and payment status only.</p>
              </div>
            )}

            {p.status === "paid" && p.paid && <div className="bench-paid">Paid outside Bench by {p.paid.method}{p.paid.ref ? ` · ref ${p.paid.ref}` : ""} on {p.paid.date}.</div>}

            {isBrand && p.status === "invoiced" && (
              <div className="bench-stack">
                <form className="bench-row" style={{ alignItems: "end" }} onSubmit={(e) => { e.preventDefault(); run(() => markPaid(id, p.id, pay)); }}>
                  <div className="bench-field"><label className="bench-label" htmlFor="pay-date">Paid on</label><input id="pay-date" type="date" className="bench-input" value={pay.date} onChange={(e) => setPay({ ...pay, date: e.target.value })} required /></div>
                  <div className="bench-field"><label className="bench-label" htmlFor="pay-method">Method</label><select id="pay-method" className="bench-input" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>{["ACH", "Check", "Wire", "Other"].map((m) => <option key={m}>{m}</option>)}</select></div>
                  <div className="bench-field"><label className="bench-label" htmlFor="pay-ref">Reference</label><input id="pay-ref" className="bench-input" value={pay.ref} maxLength={80} onChange={(e) => setPay({ ...pay, ref: e.target.value })} placeholder="ACH trace or check no." /></div>
                  <button className="button w-button" type="submit" disabled={pending}>Mark as paid</button>
                </form>
                <form className="bench-row" style={{ alignItems: "end" }} onSubmit={(e) => { e.preventDefault(); run(() => questionInvoice(id, p.id, question)); }}>
                  <div className="bench-field" style={{ flex: 1 }}><label className="bench-label" htmlFor="q-note">Question this invoice</label><input id="q-note" className="bench-input" value={question} maxLength={1000} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Jewel deductions look high" /></div>
                  <button className="button bench-btn-ghost w-button" type="submit" disabled={pending || !question.trim()}>Send question</button>
                </form>
              </div>
            )}
            {!isBrand && p.status === "invoiced" && <p className="bench-notice" style={{ margin: 0 }}>Sent to {brandName}. Due {p.dueDate}. You&rsquo;ll be emailed when they mark it paid.</p>}
          </div>
        )}
      </section>

      <aside className="bench-stack bench-builder_side">
        <div className="bench-card is-white bench-stack" style={{ gap: 10 }}>
          <h2 className="bench-eyebrow" style={{ margin: 0 }}>Months</h2>
          {periods.length === 0 ? <p className="bench-hint" style={{ margin: 0 }}>None yet.</p> : (
            <ul className="bench-plainlist" style={{ gap: 6 }}>
              {periods.map((x) => (
                <li key={x.id}><button type="button" className="bench-chip" aria-pressed={x.id === p?.id} style={{ width: "100%", display: "flex", justifyContent: "space-between", gap: 8 }} onClick={() => setSel(x.id)}>
                  <span>{monthName(x.period)}</span><span>{STATUS[x.status][0]}</span></button></li>
              ))}
            </ul>
          )}
        </div>
        <div className="bench-card is-white bench-stack" style={{ gap: 10 }}>
          <h2 className="bench-eyebrow" style={{ margin: 0 }}>Agreed terms</h2>
          {isBrand ? (terms ? (
            <dl className="bench-dl bench-small">
              <dt>Commission</dt><dd>{terms.rate}% of net sales on covered accounts</dd>
              <dt>Retainer</dt><dd>{terms.retainer > 0 ? `${usd(terms.retainer)} a month${terms.retainerFrom ? `, ${terms.retainerFrom} to ${terms.retainerTo ?? "ongoing"}` : ""}` : "None"}</dd>
              <dt>Invoices due</dt><dd>{terms.dueDays} days</dd>
              {terms.notes && (<><dt>Notes</dt><dd>{terms.notes}</dd></>)}
            </dl>
          ) : <p className="bench-hint" style={{ margin: 0 }}>{otherName} hasn&rsquo;t recorded the terms yet.</p>) : (
            <form className="bench-stack" style={{ gap: 10 }} onSubmit={(e) => { e.preventDefault(); run(() => saveTerms(id, t)); }}>
              <div className="bench-grid-2">
                <div className="bench-field"><label className="bench-label" htmlFor="t-rate">Rate (%)</label><input id="t-rate" className="bench-input" inputMode="decimal" value={t.rate} onChange={(e) => setT({ ...t, rate: e.target.value })} required /></div>
                <div className="bench-field"><label className="bench-label" htmlFor="t-ret">Retainer ($/mo)</label><input id="t-ret" className="bench-input" inputMode="decimal" value={t.retainer} onChange={(e) => setT({ ...t, retainer: e.target.value })} /></div>
                <div className="bench-field"><label className="bench-label" htmlFor="t-from">Retainer from</label><input id="t-from" type="date" className="bench-input" value={t.retainerFrom} onChange={(e) => setT({ ...t, retainerFrom: e.target.value })} /></div>
                <div className="bench-field"><label className="bench-label" htmlFor="t-to">Retainer to</label><input id="t-to" type="date" className="bench-input" value={t.retainerTo} onChange={(e) => setT({ ...t, retainerTo: e.target.value })} /></div>
              </div>
              <div className="bench-field"><label className="bench-label" htmlFor="t-due">Invoices due (days)</label><input id="t-due" className="bench-input" inputMode="numeric" value={t.dueDays} onChange={(e) => setT({ ...t, dueDays: e.target.value })} /></div>
              <div className="bench-field"><label className="bench-label" htmlFor="t-notes">Notes</label><textarea id="t-notes" className="bench-input" style={{ minHeight: 70 }} value={t.notes} maxLength={2000} onChange={(e) => setT({ ...t, notes: e.target.value })} /></div>
              <div><button className="button bench-btn-ghost is-small w-button" type="submit" disabled={pending}>Save terms</button></div>
              <p className="bench-hint" style={{ margin: 0 }}>{brandName} sees these terms.</p>
            </form>
          )}
        </div>
      </aside>
    </div>
  );
}
