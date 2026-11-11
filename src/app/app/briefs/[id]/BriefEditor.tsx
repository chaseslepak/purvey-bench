"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { UsTileMap } from "@/components/listing/UsTileMap";
import { saveBrief, type BriefInput } from "../actions";
import { Chips, RefPicker } from "@/components/pickers";

import type { Ref } from "@/components/pickers";
type RefData = { regions: { code: string; name: string }[]; states: { code: string; name: string; region_code: string }[]; retailers: Ref[]; channels: Ref[]; distributors: Ref[]; categories: Ref[] };

export function BriefEditor({ id, initial, refs }: { id: string; initial: BriefInput; refs: RefData }) {
  const router = useRouter();
  const [b, setB] = useState(initial);
  const [status, setStatus] = useState<string>("");
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
      <RefPicker label="Target retailers" placeholder="Add a retailer, e.g. Kroger" options={refs.retailers} selected={b.retailers} onChange={(v) => setB({ ...b, retailers: v })} />
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
