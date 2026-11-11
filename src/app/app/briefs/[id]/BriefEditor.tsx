"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { UsTileMap } from "@/components/listing/UsTileMap";
import { saveBrief, type BriefInput } from "../actions";

type Ref = { id: number; name: string };
type RefData = { regions: { code: string; name: string }[]; states: { code: string; name: string; region_code: string }[]; retailers: Ref[]; channels: Ref[]; distributors: Ref[]; categories: Ref[] };

function Chips({ options, selected, onChange, label }: { options: Ref[]; selected: number[]; onChange: (v: number[]) => void; label: string }) {
  const set = new Set(selected);
  return (
    <div className="bench-chips" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.id} type="button" className="bench-chip" aria-pressed={set.has(o.id)} onClick={() => onChange(set.has(o.id) ? selected.filter((x) => x !== o.id) : [...selected, o.id])}>{o.name}</button>
      ))}
    </div>
  );
}

export function BriefEditor({ id, initial, refs }: { id: string; initial: BriefInput; refs: RefData }) {
  const router = useRouter();
  const [b, setB] = useState(initial);
  const [status, setStatus] = useState<string>("");
  const [q, setQ] = useState("");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(async () => {
      setStatus("Saving…");
      const r = await saveBrief(id, b);
      setStatus(r.ok ? "Saved" : r.error ?? "Couldn't save");
      if (r.ok) router.refresh(); // re-rank the top 10
    }, 700);
    return () => clearTimeout(t);
  }, [b, id, router]);

  const names = Object.fromEntries(refs.states.map((s) => [s.code, s.name]));
  const addRetailer = () => {
    const m = refs.retailers.find((r) => r.name.toLowerCase() === q.trim().toLowerCase());
    if (m && !b.retailers.includes(m.id)) setB({ ...b, retailers: [...b.retailers, m.id] });
    setQ("");
  };
  return (
    <div className="bench-stack">
      <div className="bench-row" style={{ justifyContent: "space-between" }}>
        <div className="bench-field" style={{ flex: "1 1 320px" }}>
          <label htmlFor="b-title" className="bench-label">Title</label>
          <input id="b-title" className="bench-input" value={b.title} maxLength={140} onChange={(e) => setB({ ...b, title: e.target.value })} />
        </div>
        <span className="bench-save" role="status" aria-live="polite">{status}</span>
      </div>
      <div className="bench-field">
        <label htmlFor="b-cat" className="bench-label">Category</label>
        <select id="b-cat" className="bench-input" value={b.categoryId ?? ""} onChange={(e) => setB({ ...b, categoryId: e.target.value ? Number(e.target.value) : null })}>
          <option value="">Any</option>
          {refs.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <h3 className="bench-label">Regions</h3>
      <div className="bench-chips" role="group" aria-label="Regions">
        {refs.regions.map((r) => (
          <button key={r.code} type="button" className="bench-chip" aria-pressed={b.regions.includes(r.code)}
            onClick={() => setB({ ...b, regions: b.regions.includes(r.code) ? b.regions.filter((x) => x !== r.code) : [...b.regions, r.code] })}>{r.name}</button>
        ))}
      </div>
      <h3 className="bench-label">Or specific states</h3>
      <UsTileMap selected={new Set(b.states)} names={names} onToggle={(c) => setB({ ...b, states: b.states.includes(c) ? b.states.filter((x) => x !== c) : [...b.states, c] })} />
      <h3 className="bench-label">Target retailers</h3>
      <div className="bench-retailer-add" style={{ gridTemplateColumns: "minmax(0, 1fr) auto" }}>
        <div className="bench-field">
          <label htmlFor="b-ret" className="bench-sr-only">Add a target retailer</label>
          <input id="b-ret" className="bench-input" list="b-ret-list" value={q} placeholder="Add a retailer, e.g. Kroger" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addRetailer(); } }} />
          <datalist id="b-ret-list">{refs.retailers.map((r) => <option key={r.id} value={r.name} />)}</datalist>
        </div>
        <button type="button" className="button w-button" onClick={addRetailer}>Add</button>
      </div>
      {b.retailers.length > 0 && (
        <div className="bench-chips">
          {b.retailers.map((id) => {
            const n = refs.retailers.find((r) => r.id === id)?.name ?? "Retailer";
            return <button key={id} type="button" className="bench-chip" aria-pressed="true" aria-label={`Remove ${n}`} onClick={() => setB({ ...b, retailers: b.retailers.filter((x) => x !== id) })}>{n} ×</button>;
          })}
        </div>
      )}
      <h3 className="bench-label">Channels</h3>
      <Chips label="Channels" options={refs.channels} selected={b.channels} onChange={(v) => setB({ ...b, channels: v })} />
      <h3 className="bench-label">Distributors</h3>
      <Chips label="Distributors" options={refs.distributors} selected={b.distributors} onChange={(v) => setB({ ...b, distributors: v })} />
      <div className="bench-field">
        <label htmlFor="b-notes" className="bench-label">Notes (private)</label>
        <textarea id="b-notes" className="bench-input" value={b.notes ?? ""} maxLength={4000} onChange={(e) => setB({ ...b, notes: e.target.value })} />
      </div>
    </div>
  );
}
