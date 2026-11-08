"use client";

import { useState } from "react";

/** Retailer typeahead: type a name, the form submits the retailer's id. */
export function RetailerFilter({ options, initial }: { options: { id: number; name: string }[]; initial?: number }) {
  const [text, setText] = useState(options.find((o) => o.id === initial)?.name ?? "");
  const match = options.find((o) => o.name.toLowerCase() === text.trim().toLowerCase());
  return (
    <div className="bench-field">
      <label htmlFor="f-retailer" className="bench-label">Retailer</label>
      <input id="f-retailer" className="bench-input" list="f-retailer-list" value={text} placeholder="e.g. Kroger" onChange={(e) => setText(e.target.value)} autoComplete="off" />
      <datalist id="f-retailer-list">{options.map((o) => <option key={o.id} value={o.name} />)}</datalist>
      <input type="hidden" name="retailer" value={match?.id ?? ""} />
      {text && !match && <p className="bench-hint" style={{ margin: 0 }}>Pick a retailer from the list.</p>}
    </div>
  );
}
