"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/browser";
import { deleteToolboxFile, openToolboxFile, registerToolboxFile } from "../deal-actions";

const FOLDERS = ["Sell sheets", "Decks", "Pricing", "Spec sheets", "Retail photos", "Reports", "Other"] as const;
const EXT: Record<string, string> = {
  "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "text/csv": "csv",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls", "application/vnd.ms-powerpoint": "ppt",
};
export type ToolFile = { id: string; name: string; folder: string; mine: boolean; by: string; at: string; size: number; activity: string | null };

export function Toolbox({ id, isBrand, otherName, files }: { id: string; isBrand: boolean; otherName: string; files: ToolFile[] }) {
  const router = useRouter();
  const [folder, setFolder] = useState<string>("All");
  const [uploadFolder, setUploadFolder] = useState<string>(isBrand ? "Sell sheets" : "Retail photos");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [, start] = useTransition();
  const shown = files.filter((f) => folder === "All" || f.folder === folder);

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true); setMsg(null);
    const supabase = createClient();
    let added = 0;
    for (const f of Array.from(list)) {
      const ext = EXT[f.type];
      if (!ext || f.size > 25 * 1024 * 1024) { setMsg(`${f.name}: use PDF, PowerPoint, Excel, Word, CSV or an image, up to 25 MB.`); continue; }
      const path = `${id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("toolbox").upload(path, f, { contentType: f.type });
      if (error) { setMsg(`${f.name}: upload failed.`); continue; }
      const r = await registerToolboxFile(id, { path, name: f.name.slice(0, 200), mime: f.type, folder: uploadFolder });
      if (r.error) setMsg(`${f.name}: ${r.error}`); else added++;
    }
    setBusy(false);
    if (added) { setMsg(`${added} file${added === 1 ? "" : "s"} added to ${uploadFolder}. ${otherName} can see ${added === 1 ? "it" : "them"} now.`); router.refresh(); }
  }

  return (
    <section className="bench-section bench-stack" aria-labelledby="tb-h">
      <div>
        <h2 id="tb-h" className="bench-h-section" style={{ fontSize: "1.75rem" }}>Toolbox</h2>
        <p className="bench-muted" style={{ margin: "6px 0 0", maxWidth: "62ch" }}>
          {isBrand ? `Everything ${otherName} needs to sell your line. Files here are shared with ${otherName} only, and you can see when they open them.` : `${otherName}'s sales materials, plus anything you add, like retail photos and reports.`}
        </p>
      </div>
      <nav className="bench-chips" aria-label="Folders">
        {["All", ...FOLDERS].map((f) => <button key={f} type="button" className="bench-chip" aria-pressed={folder === f} onClick={() => setFolder(f)}>{f}</button>)}
      </nav>
      <div className="bench-card bench-row" style={{ justifyContent: "space-between" }}>
        <div className="bench-row">
          <label className="bench-label" htmlFor="tb-folder">Add to</label>
          <select id="tb-folder" className="bench-input" style={{ width: "auto", minHeight: 44 }} value={uploadFolder} onChange={(e) => setUploadFolder(e.target.value)}>
            {FOLDERS.map((f) => <option key={f}>{f}</option>)}
          </select>
        </div>
        <label className="button w-button" style={{ cursor: "pointer" }}>
          {busy ? "Uploading…" : "Upload files"}
          <input type="file" multiple className="bench-sr-only" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }}
            accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.pptx,.xlsx,.docx,.xls,.ppt" />
        </label>
      </div>
      <p className="bench-hint" style={{ margin: 0 }}>PDF, PowerPoint, Excel, Word, CSV or images, up to 25 MB each.</p>
      {msg && <p className="bench-notice" role="status" style={{ margin: 0 }}>{msg}</p>}
      {shown.length === 0 ? <p className="bench-muted" style={{ margin: 0 }}>No files {folder === "All" ? "yet" : `in ${folder}`}.</p> : (
        <div className="bench-table-wrap">
          <table className="bench-table">
            <thead><tr><th scope="col">File</th><th scope="col">Folder</th><th scope="col">Added by</th><th scope="col">Added</th><th scope="col">{otherName}</th><th scope="col"><span className="bench-sr-only">Actions</span></th></tr></thead>
            <tbody>
              {shown.map((f) => (
                <tr key={f.id}>
                  <td><button type="button" className="bench-link-btn" onClick={() => start(async () => { const r = await openToolboxFile(id, f.id); if (r.url) window.open(r.url, "_blank", "noopener"); else setMsg(r.error ?? null); })}>{f.name}</button><div className="bench-small bench-muted">{(f.size / 1024 / 1024).toFixed(1)} MB</div></td>
                  <td>{f.folder}</td>
                  <td>{f.by}</td>
                  <td>{new Date(f.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                  <td>{f.mine ? <span className={`bench-tag ${f.activity ? "is-mist" : ""}`}>{f.activity ?? "Not opened yet"}</span> : <span className="bench-muted">—</span>}</td>
                  <td>{f.mine && <button type="button" className="bench-link-btn" aria-label={`Delete ${f.name}`} onClick={() => start(async () => { const r = await deleteToolboxFile(id, f.id); setMsg(r.error ?? "Deleted."); router.refresh(); })}>Delete</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
