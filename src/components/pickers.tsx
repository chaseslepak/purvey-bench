"use client";

import { useId, useState } from "react";

export type Ref = { id: number; name: string };

/** Toggle chips for a short list (channels, distributors, certifications). */
export function Chips<T extends string | number>({ options, selected, onChange, label, other, onOther }: {
  options: { id: T; name: string }[]; selected: T[]; onChange: (v: T[]) => void; label: string;
  /** Free-text "add your own" values, for anything not on the list. */
  other?: string[]; onOther?: (v: string[]) => void;
}) {
  const set = new Set(selected);
  const chips = (
    <div className="bench-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.id)} type="button" className="bench-chip" aria-pressed={set.has(o.id)}
          onClick={() => onChange(set.has(o.id) ? selected.filter((x) => x !== o.id) : [...selected, o.id])}>{o.name}</button>
      ))}
    </div>
  );
  if (!onOther) return chips;
  return (
    <div className="bench-stack" style={{ gap: 10 }}>
      {chips}
      <OtherNames label={`Other ${label.toLowerCase()}`} values={other ?? []} onChange={onOther} known={options.map((o) => o.name)}
        onKnown={(name) => { const m = options.find((o) => o.name.toLowerCase() === name.toLowerCase()); if (m && !set.has(m.id)) onChange([...selected, m.id]); }} />
    </div>
  );
}

/** Type-ahead picker for a long list (retailers, categories): add by name, remove by chip. */
export function RefPicker({ options, selected, onChange, label, placeholder, other, onOther }: {
  options: Ref[]; selected: number[]; onChange: (v: number[]) => void; label: string; placeholder: string;
  /** Free-text values: a name that isn't on the list is added as the user's own. */
  other?: string[]; onOther?: (v: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const id = useId();
  const others = other ?? [];
  const add = () => {
    const v = clean(q);
    if (!v) return;
    const m = options.find((r) => r.name.toLowerCase() === v.toLowerCase());
    if (m) { if (!selected.includes(m.id)) onChange([...selected, m.id]); setMsg(null); }
    else if (onOther) {
      if (others.some((x) => x.toLowerCase() === v.toLowerCase())) setMsg(`${v} is already added.`);
      else if (others.length >= 20) setMsg("You can add up to 20 of your own.");
      else { onOther([...others, v]); setMsg(`Added \u201c${v}\u201d. It isn\u2019t on our list yet, so we\u2019ll show it as you typed it.`); }
    } else { setMsg(`Nothing on the list is called \u201c${v}\u201d. Pick a suggestion as you type.`); return; }
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
      {msg && <p className="bench-hint" role="status" style={{ margin: 0 }}>{msg}</p>}
      {selected.length + others.length > 0 && (
        <div className="bench-chips" aria-label={`${label}: selected`}>
          {selected.map((sid) => {
            const n = options.find((r) => r.id === sid)?.name ?? "—";
            return <button key={sid} type="button" className="bench-chip" aria-pressed="true" aria-label={`Remove ${n}`} onClick={() => onChange(selected.filter((x) => x !== sid))}>{n} ×</button>;
          })}
          {others.map((v) => <button key={`o-${v}`} type="button" className="bench-chip is-own" aria-pressed="true" aria-label={`Remove ${v}`} onClick={() => onOther?.(others.filter((x) => x !== v))}>{v} ×</button>)}
        </div>
      )}
    </div>
  );
}

const clean = (v: string) => v.trim().replace(/[<>]/g, "").replace(/\s+/g, " ").slice(0, 80);

/** Free-text names for anything not on our lists (e.g. a regional distributor). */
export function OtherNames({ values, onChange, label, placeholder = "Not listed? Type your own and press Add", known, onKnown }: {
  values: string[]; onChange: (v: string[]) => void; label: string; placeholder?: string;
  /** Names already on the list: typing one selects it instead of adding a duplicate. */
  known?: string[]; onKnown?: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const id = useId();
  const add = () => {
    const v = clean(q);
    if (v && known?.some((k) => k.toLowerCase() === v.toLowerCase()) && onKnown) onKnown(v);
    else if (v && !values.some((x) => x.toLowerCase() === v.toLowerCase()) && values.length < 20) onChange([...values, v]);
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
          {values.map((v) => <button key={v} type="button" className="bench-chip is-own" aria-pressed="true" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))}>{v} ×</button>)}
        </div>
      )}
    </div>
  );
}
