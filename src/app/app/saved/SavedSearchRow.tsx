"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { deleteSavedSearch, updateSavedSearch } from "./actions";

export function SavedSearchRow({ id, name, description, href, alerts }: { id: string; name: string; description: string; href: string; alerts: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(alerts);
  const [status, setStatus] = useState("");
  const [pending, start] = useTransition();
  return (
    <li className="bench-card bench-row bench-savedsearch" style={{ justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ minWidth: 0 }}>
        <Link className="bench-link" href={href}><strong>{name}</strong></Link>
        <p className="bench-small bench-muted" style={{ margin: "2px 0 0" }}>{description}</p>
      </div>
      <div className="bench-row" style={{ gap: 14 }}>
        <label className="bench-row bench-small" style={{ gap: 6 }}>
          <input type="checkbox" checked={on} disabled={pending} aria-label={`Weekly email for ${name}`}
            onChange={(e) => { const v = e.target.checked; setOn(v); start(async () => { const r = await updateSavedSearch(id, { alerts: v }); setStatus(r.ok ? "" : "Couldn't save"); if (!r.ok) setOn(!v); }); }} />
          Weekly email
        </label>
        <button type="button" className="bench-link bench-small" disabled={pending}
          onClick={() => start(async () => { const r = await deleteSavedSearch(id); if (r.ok) router.refresh(); else setStatus("Couldn't delete"); })}>
          Delete<span className="bench-sr-only"> {name}</span>
        </button>
        <span className="bench-save" role="status" aria-live="polite">{status}</span>
      </div>
    </li>
  );
}
