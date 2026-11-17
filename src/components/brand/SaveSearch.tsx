"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { saveSearch } from "@/app/find/actions";

/** "Save this search" on /find: name it, and choose a weekly email when new brokers match. */
export function SaveSearch({ query, defaultName }: { query: string; defaultName: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(defaultName);
  const [alerts, setAlerts] = useState(true);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done) return <p className="bench-small" role="status" style={{ margin: 0 }}>Search saved{alerts ? ". We’ll email you each week when new brokers match" : ""}. <Link className="bench-link" href="/app/saved#searches">Saved searches</Link></p>;
  if (!open) return <button type="button" className="button bench-btn-ghost is-small w-button" onClick={() => setOpen(true)}>Save this search</button>;
  return (
    <form className="bench-card bench-stack bench-savesearch" style={{ gap: 10 }} onSubmit={(e) => {
      e.preventDefault(); setError(null);
      start(async () => { const r = await saveSearch(query, name, alerts); if (r.error) setError(r.error); else setDone(true); });
    }}>
      <div className="bench-field">
        <label className="bench-label" htmlFor="ss-name">Name this search</label>
        <input id="ss-name" className="bench-input" value={name} maxLength={80} required onChange={(e) => setName(e.target.value)} />
      </div>
      <label className="bench-row bench-small" style={{ gap: 8 }}>
        <input type="checkbox" checked={alerts} onChange={(e) => setAlerts(e.target.checked)} /> Email me weekly when new brokers match
      </label>
      <div className="bench-row">
        <button type="submit" className="button is-small w-button" disabled={pending}>{pending ? "Saving…" : "Save search"}</button>
        <button type="button" className="bench-link bench-small" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {error && <p className="bench-error" role="alert" style={{ margin: 0 }}>{error}</p>}
    </form>
  );
}
