"use client";

import { useEffect, useRef, useState } from "react";
import { updateSaved } from "./actions";

export function SavedFields({ id, folder, note, folders, name }: { id: string; folder: string; note: string; folders: string[]; name: string }) {
  const [f, setF] = useState(folder);
  const [n, setN] = useState(note);
  const [status, setStatus] = useState("");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const t = setTimeout(async () => { setStatus("Saving…"); const r = await updateSaved(id, { folder: f, note: n }); setStatus(r.ok ? "Saved" : "Couldn't save"); }, 700);
    return () => clearTimeout(t);
  }, [f, n, id]);
  return (
    <div className="bench-stack" style={{ gap: 10 }}>
      <div className="bench-field">
        <label className="bench-label" htmlFor={`folder-${id}`}>Folder</label>
        <input id={`folder-${id}`} className="bench-input" list={`folders-${id}`} value={f} placeholder="e.g. Midwest snacks" onChange={(e) => setF(e.target.value)} />
        <datalist id={`folders-${id}`}>{folders.map((x) => <option key={x} value={x} />)}</datalist>
      </div>
      <div className="bench-field">
        <label className="bench-label" htmlFor={`note-${id}`}>Private note on {name}</label>
        <textarea id={`note-${id}`} className="bench-input" style={{ minHeight: 80 }} value={n} maxLength={4000} onChange={(e) => setN(e.target.value)} />
      </div>
      <span className="bench-save" role="status" aria-live="polite">{status}</span>
    </div>
  );
}
