"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Turnstile, useTurnstileReady } from "@/components/ui/Turnstile";
import { createClient } from "@/lib/supabase/browser";
import { sendMessage, startConversation, type Attachment } from "../actions";

const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const EXT: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export function Compose({ brokerOrgId, brokerName, briefs, needsTurnstile, turnstileSiteKey, defaultBrief }: {
  brokerOrgId: string; brokerName: string; briefs: { id: string; title: string }[]; needsTurnstile: boolean; turnstileSiteKey: string; defaultBrief: string | null;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [brief, setBrief] = useState<string>(defaultBrief ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ts = useTurnstileReady(needsTurnstile ? turnstileSiteKey : "");

  function submit(form: HTMLFormElement) {
    setError(null);
    const token = (new FormData(form).get("cf-turnstile-response") as string | null) ?? null;
    start(async () => {
      const r = await startConversation({ brokerOrgId, body, briefId: brief || null, turnstile: token });
      if (!r.id) return setError(r.error ?? "Couldn't send your message.");
      if (files.length) {
        // Files go into the new thread's private folder, then into a follow-up message.
        const supabase = createClient();
        const uploaded: Attachment[] = [];
        for (const f of files) {
          const path = `${r.id}/${crypto.randomUUID()}.${EXT[f.type]}`;
          const { error: e } = await supabase.storage.from("message-files").upload(path, f, { contentType: f.type });
          if (!e) uploaded.push({ path, name: f.name.slice(0, 200), size: f.size, type: f.type as Attachment["type"] });
        }
        if (uploaded.length) await sendMessage(r.id, "", uploaded);
      }
      router.push(`/app/inbox/${r.id}`);
    });
  }

  return (
    <form className="bench-form" onSubmit={(e) => { e.preventDefault(); submit(e.currentTarget); }}>
      <div className="bench-field">
        <label className="bench-label" htmlFor="compose-body">Message to {brokerName}</label>
        <textarea id="compose-body" className="bench-input" style={{ minHeight: 160 }} required maxLength={10000} value={body} onChange={(e) => setBody(e.target.value)}
          placeholder="Introduce your brand, what you're looking for, and the retailers you want." />
      </div>
      <div className="bench-field">
        <label className="bench-label" htmlFor="compose-brief">Attach a brief (optional)</label>
        <select id="compose-brief" className="bench-input" value={brief} onChange={(e) => setBrief(e.target.value)}>
          <option value="">No brief</option>
          {briefs.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
        </select>
        <p className="bench-hint" style={{ margin: 0 }}>{brokerName} sees a one-time summary of this brief in this conversation only, never your brief list.</p>
      </div>
      <div className="bench-field">
        <label className="bench-label" htmlFor="compose-files">Files (optional)</label>
        <input id="compose-files" type="file" multiple className="bench-input" style={{ paddingTop: 14 }} accept="application/pdf,image/png,image/jpeg,image/webp"
          onChange={(e) => { const list = Array.from(e.target.files ?? []); const ok = list.filter((f) => ALLOWED.includes(f.type) && f.size <= 10 * 1024 * 1024).slice(0, 5); setFiles(ok); setError(ok.length < list.length ? "Some files were skipped: PDFs or images up to 10 MB, five at most." : null); }} />
        <p className="bench-hint" style={{ margin: 0 }}>Sell sheet, pricing or spec sheet. PDF or image, up to 10 MB each.</p>
      </div>
      {needsTurnstile && <Turnstile siteKey={turnstileSiteKey} onToken={ts.onToken} />}
      {error && <p className="bench-notice is-error" role="alert" style={{ margin: 0 }}>{error}</p>}
      <div><button className="button w-button" type="submit" disabled={pending || !ts.ready}>{pending ? "Sending…" : !ts.ready ? "Checking…" : "Send message"}</button></div>
    </form>
  );
}
