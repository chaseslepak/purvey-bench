"use client";

import { useId, useState } from "react";

export type Ref = { id: number; name: string };

/** Toggle chips for a short list (channels, distributors, certifications). */
export function Chips<T extends string | number>({ options, selected, onChange, label }: { options: { id: T; name: string }[]; selected: T[]; onChange: (v: T[]) => void; label: string }) {
  const set = new Set(selected);
  return (
    <div className="bench-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.id)} type="button" className="bench-chip" aria-pressed={set.has(o.id)}
          onClick={() => onChange(set.has(o.id) ? selected.filter((x) => x !== o.id) : [...selected, o.id])}>{o.name}</button>
      ))}
    </div>
  );
}

/** Type-ahead picker for a long list (retailers, categories): add by name, remove by chip. */
export function RefPicker({ options, selected, onChange, label, placeholder }: { options: Ref[]; selected: number[]; onChange: (v: number[]) => void; label: string; placeholder: string }) {
  const [q, setQ] = useState("");
  const id = useId();
  const add = () => {
    const m = options.find((r) => r.name.toLowerCase() === q.trim().toLowerCase());
    if (m && !selected.includes(m.id)) onChange([...selected, m.id]);
    setQ("");
  };
  return (
    <div className="bench-stack" style={{ gap: 10 }}>
      <div className="bench-retailer-add" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
        <div className="bench-field">
          <label htmlFor={id} className="bench-sr-only">{label}</label>
          <input id={id} className="bench-input" list={`${id}-list`} value={q} placeholder={placeholder}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          <datalist id={`${id}-list`}>{options.map((r) => <option key={r.id} value={r.name} />)}</datalist>
        </div>
        <button type="button" className="button w-button" onClick={add}>Add</button>
      </div>
      {selected.length > 0 && (
        <div className="bench-chips" aria-label={`${label}: selected`}>
          {selected.map((sid) => {
            const n = options.find((r) => r.id === sid)?.name ?? "—";
            return <button key={sid} type="button" className="bench-chip" aria-pressed="true" aria-label={`Remove ${n}`} onClick={() => onChange(selected.filter((x) => x !== sid))}>{n} ×</button>;
          })}
        </div>
      )}
    </div>
  );
}

/** Free-text names for anything not on our lists (e.g. a regional distributor). */
export function OtherNames({ values, onChange, label, placeholder }: { values: string[]; onChange: (v: string[]) => void; label: string; placeholder: string }) {
  const [q, setQ] = useState("");
  const id = useId();
  const add = () => {
    const v = q.trim().replace(/[<>]/g, "").slice(0, 80);
    if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase()) && values.length < 20) onChange([...values, v]);
    setQ("");
  };
  return (
    <div className="bench-stack" style={{ gap: 10 }}>
      <div className="bench-retailer-add" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
        <div className="bench-field">
          <label htmlFor={id} className="bench-sr-only">{label}</label>
          <input id={id} className="bench-input" value={q} maxLength={80} placeholder={placeholder}
            onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        </div>
        <button type="button" className="button bench-btn-ghost w-button" onClick={add}>Add</button>
      </div>
      {values.length > 0 && (
        <div className="bench-chips" aria-label={`${label}: added`}>
          {values.map((v) => <button key={v} type="button" className="bench-chip" aria-pressed="true" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>{v} ×</button>)}
        </div>
      )}
    </div>
  );
}
