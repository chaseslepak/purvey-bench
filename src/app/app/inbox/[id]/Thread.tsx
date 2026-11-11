"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/browser";
import {
  addNote, attachmentUrl, blockOrg, declineConversation, deleteNote, markRead, reportConversation, sendMessage, updateSide, type Attachment,
} from "../actions";

export type Msg = { id: string; body: string; created_at: string; sender_org_id: string; sender_user_id: string | null; is_auto_reply: boolean; read_at: string | null; attachments: Attachment[] };
type Person = { id: string; name: string };
export type ThreadProps = {
  conversationId: string;
  myOrgId: string;
  myOrgType: "brand" | "broker";
  myUserId: string;
  myName: string;
  otherOrgId: string;
  otherName: string;
  declined: { reason: string; note: string | null } | null;
  briefSummary: Record<string, unknown> | null;
  messages: Msg[];
  people: Record<string, string>; // user id -> name (teammates + other side senders)
  side: { stage: string | null; archived: boolean; muted: boolean; assignee: string | null };
  stages: readonly (readonly [string, string])[];
  teammates: Person[];
  notes: { id: string; body: string; author: string; created_at: string; mine: boolean }[];
  templates: { id: string; title: string; body: string }[];
};

const DECLINE_REASONS: [string, string][] = [["not_a_fit", "Not a fit"], ["category_conflict", "Category conflict"], ["not_taking_new_lines", "Not taking new lines"], ["other", "Other"]];
const ALLOWED = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;
const EXT: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
const time = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** Plain text with links: URLs become links; nothing is ever rendered as HTML. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s<>"']+)/g);
  return <>{parts.map((p, i) => (/^https?:\/\//.test(p) ? <a key={i} className="bench-link" href={p} target="_blank" rel="noopener noreferrer nofollow">{p}</a> : <span key={i}>{p}</span>))}</>;
}

function FileChip({ a }: { a: Attachment }) {
  return (
    <button type="button" className="bench-tag" onClick={async () => { const u = await attachmentUrl(a.path); if (u) window.open(u, "_blank", "noopener"); }}>
      {a.type === "application/pdf" ? "PDF" : "Image"} · {a.name}
    </button>
  );
}

export function Thread(p: ThreadProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<Msg[]>(p.messages);
  const [text, setText] = useState("");
  const [files, setFiles] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const lastTyping = useRef(0);

  // Realtime: new messages and read receipts (RLS-filtered), plus private typing broadcasts.
  useEffect(() => {
    let active = true;
    let pg: ReturnType<typeof supabase.channel> | null = null;
    // Realtime is best-effort: whenever the channel (re)connects, catch up from
    // the database so a missed insert or read receipt still shows.
    const catchUp = async () => {
      const { data } = await supabase.from("messages").select("id, body, created_at, sender_org_id, sender_user_id, is_auto_reply, read_at, attachments")
        .eq("conversation_id", p.conversationId).order("created_at");
      if (!active || !data) return;
      setMessages((ms) => {
        const byId = new Map(ms.map((x) => [x.id, x]));
        for (const m of data as Msg[]) byId.set(m.id, { ...byId.get(m.id), ...m });
        return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
      });
    };
    (async () => {
      // Subscribe only once the user's token is on the socket, or RLS filters every event out.
      await supabase.realtime.setAuth();
      if (!active) return;
      pg = supabase
        .channel(`msgs:${p.conversationId}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${p.conversationId}` }, (payload) => {
          const m = payload.new as Msg;
          setMessages((ms) => (ms.some((x) => x.id === m.id) ? ms : [...ms, m]));
          if (m.sender_org_id !== p.myOrgId) { setTyping(null); void markRead(p.conversationId); }
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `conversation_id=eq.${p.conversationId}` }, (payload) => {
          const m = payload.new as Msg;
          setMessages((ms) => ms.map((x) => (x.id === m.id ? { ...x, read_at: m.read_at } : x)));
        })
        .subscribe((status) => { if (status === "SUBSCRIBED") void catchUp(); });
      const ch = supabase.channel(`conv:${p.conversationId}`, { config: { private: true, broadcast: { self: false } } })
        .on("broadcast", { event: "typing" }, ({ payload }) => {
          if (payload?.org === p.myOrgId) return;
          setTyping(String(payload?.name ?? "Someone"));
          setTimeout(() => setTyping(null), 3500);
        })
        .subscribe();
      channelRef.current = ch;
    })();
    void markRead(p.conversationId);
    const onVisible = () => { if (document.visibilityState === "visible") void catchUp(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { active = false; document.removeEventListener("visibilitychange", onVisible); if (pg) void supabase.removeChannel(pg); if (channelRef.current) void supabase.removeChannel(channelRef.current); };
  }, [supabase, p.conversationId, p.myOrgId]);

  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [messages.length]);

  function onType(v: string) {
    setText(v);
    const now = Date.now();
    if (now - lastTyping.current > 2000 && channelRef.current) {
      lastTyping.current = now;
      void channelRef.current.send({ type: "broadcast", event: "typing", payload: { org: p.myOrgId, name: p.myName } });
    }
  }

  async function upload(list: FileList | null) {
    if (!list?.length) return;
    setError(null);
    setUploading(true);
    try {
      for (const f of Array.from(list).slice(0, 5 - files.length)) {
        if (!ALLOWED.includes(f.type as (typeof ALLOWED)[number]) || f.size > 10 * 1024 * 1024) { setError("Attach PDFs or images (PNG, JPG, WebP) up to 10 MB each."); continue; }
        const path = `${p.conversationId}/${crypto.randomUUID()}.${EXT[f.type]}`;
        const { error: e } = await supabase.storage.from("message-files").upload(path, f, { contentType: f.type });
        if (e) { setError("Upload failed. Try again."); continue; }
        setFiles((fs) => [...fs, { path, name: f.name.slice(0, 200), size: f.size, type: f.type as Attachment["type"] }]);
      }
    } finally { setUploading(false); }
  }

  function send() {
    setError(null);
    start(async () => {
      const r = await sendMessage(p.conversationId, text, files);
      if (r.error) return setError(r.error);
      setText(""); setFiles([]);
      router.refresh(); // e.g. a first reply moves the broker's own stage to Replied
    });
  }

  const myLastIndex = messages.map((m) => m.sender_org_id === p.myOrgId).lastIndexOf(true);
  const name = (m: Msg) => (m.is_auto_reply ? `${p.otherName} (auto-reply)` : m.sender_user_id ? p.people[m.sender_user_id] ?? (m.sender_org_id === p.myOrgId ? "Teammate" : p.otherName) : p.otherName);

  return (
    <div className="bench-builder_grid">
      <section className="bench-section bench-stack" aria-label={`Conversation with ${p.otherName}`}>
        {p.briefSummary && (
          <div className="bench-briefcard">
            <div className="bench-eyebrow" style={{ fontSize: 11 }}>Brief attached by the brand · one-time summary</div>
            <strong>{String(p.briefSummary.title ?? "")}</strong>
            <dl className="bench-dl bench-small" style={{ marginTop: 8 }}>
              {p.briefSummary.category ? (<><dt>Category</dt><dd>{String(p.briefSummary.category)}</dd></>) : null}
              {[...((p.briefSummary.regions as string[]) ?? []), ...((p.briefSummary.states as string[]) ?? [])].length > 0 && (<><dt>Where</dt><dd>{[...((p.briefSummary.regions as string[]) ?? []), ...((p.briefSummary.states as string[]) ?? [])].join(", ")}</dd></>)}
              {((p.briefSummary.target_retailers as string[]) ?? []).length > 0 && (<><dt>Retailers</dt><dd>{(p.briefSummary.target_retailers as string[]).join(", ")}</dd></>)}
              {((p.briefSummary.channels as string[]) ?? []).length > 0 && (<><dt>Channels</dt><dd>{(p.briefSummary.channels as string[]).join(", ")}</dd></>)}
              {((p.briefSummary.distributors as string[]) ?? []).length > 0 && (<><dt>Distributors</dt><dd>{(p.briefSummary.distributors as string[]).join(", ")}</dd></>)}
            </dl>
          </div>
        )}
        <div className="bench-msgs" ref={listRef} role="log" aria-live="polite" aria-label="Messages">
          {messages.map((m, i) => {
            const mine = m.sender_org_id === p.myOrgId;
            return (
              <div key={m.id} className={`bench-msg${mine ? " is-mine" : ""}${m.is_auto_reply ? " is-auto" : ""}`}>
                <div className="bench-msg_bubble">
                  <Linkified text={m.body} />
                  {m.attachments?.length > 0 && <div className="bench-msg_files">{m.attachments.map((a) => <FileChip key={a.path} a={a} />)}</div>}
                </div>
                <div className="bench-msg_meta">{name(m)} · {time(m.created_at)}{mine && i === myLastIndex ? ` · ${m.read_at ? "Read" : "Delivered"}` : ""}</div>
              </div>
            );
          })}
        </div>
        <div className="bench-typing" aria-live="polite">{typing ? `${typing} is typing…` : ""}</div>
        {p.declined ? (
          <div className="bench-notice" role="status">
            {p.myOrgType === "brand"
              ? <>{p.otherName} has closed this conversation{p.declined.reason ? ` (${DECLINE_REASONS.find(([k]) => k === p.declined!.reason)?.[1] ?? "Other"})` : ""}. Thanks for reaching out; you can <a className="bench-link" href="/find">find other brokers</a> that fit your brief.{p.declined.note ? ` “${p.declined.note}”` : ""}</>
              : "You declined this conversation. It's closed for both sides."}
          </div>
        ) : (
          <>
            {files.length > 0 && <div className="bench-msg_files">{files.map((f) => <span key={f.path} className="bench-tag">{f.name} <button type="button" className="bench-link-btn" aria-label={`Remove ${f.name}`} onClick={() => setFiles((fs) => fs.filter((x) => x.path !== f.path))}>×</button></span>)}</div>}
            <div className="bench-composer">
              <div className="bench-field" style={{ flex: 1 }}>
                <label htmlFor="composer" className="bench-sr-only">Message</label>
                <textarea id="composer" className="bench-input" style={{ minHeight: 64 }} value={text} maxLength={10000} placeholder="Write a message…"
                  onChange={(e) => onType(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send(); }} />
              </div>
              <div className="bench-row" style={{ flexWrap: "nowrap" }}>
                <label className="button bench-btn-ghost is-small w-button" style={{ cursor: "pointer" }}>
                  {uploading ? "Uploading…" : "Attach"}
                  <input type="file" className="bench-sr-only" multiple accept="application/pdf,image/png,image/jpeg,image/webp" onChange={(e) => { void upload(e.target.files); e.target.value = ""; }} />
                </label>
                <button type="button" className="button is-small w-button" onClick={send} disabled={pending || uploading}>Send</button>
              </div>
            </div>
            {p.templates.length > 0 && (
              <div className="bench-row bench-small" style={{ gap: 6 }}>
                <span className="bench-muted">Saved replies:</span>
                {p.templates.map((t) => <button key={t.id} type="button" className="bench-chip" onClick={() => setText(t.body)}>{t.title}</button>)}
              </div>
            )}
          </>
        )}
        {error && <p className="bench-notice is-error" role="alert" style={{ margin: 0 }}>{error}</p>}
      </section>
      <SidePanel {...p} refresh={() => router.refresh()} />
    </div>
  );
}

function SidePanel(p: ThreadProps & { refresh: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [mode, setMode] = useState<"none" | "decline" | "report">("none");
  const [reason, setReason] = useState("not_a_fit");
  const [detail, setDetail] = useState("");
  const set = async (patch: Parameters<typeof updateSide>[1], done: string) => { const r = await updateSide(p.conversationId, patch); setMsg(r.ok ? done : r.error ?? null); p.refresh(); };
  return (
    <aside className="bench-stack bench-builder_side">
      <div className="bench-card is-white bench-stack" style={{ gap: 12 }}>
        <h2 className="bench-eyebrow" style={{ margin: 0 }}>Your team only</h2>
        <div className="bench-field">
          <label className="bench-label" htmlFor="side-stage">Stage</label>
          <select id="side-stage" className="bench-input" value={p.side.stage ?? ""}
            onChange={(e) => void set(p.myOrgType === "brand" ? { brand_stage: e.target.value as never } : { broker_stage: e.target.value as never }, "Stage updated.")}>
            {p.stages.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <p className="bench-hint" style={{ margin: 0 }}>{p.otherName} never sees your stage.</p>
        </div>
        <div className="bench-field">
          <label className="bench-label" htmlFor="side-assignee">Assigned to</label>
          <select id="side-assignee" className="bench-input" value={p.side.assignee ?? ""} onChange={(e) => void set({ assignee_user_id: e.target.value || null }, "Assignment updated.")}>
            <option value="">Unassigned</option>
            {p.teammates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="bench-row" style={{ gap: 8 }}>
          <button type="button" className="button bench-btn-ghost is-small w-button" onClick={() => void set({ archived: !p.side.archived }, p.side.archived ? "Moved to inbox." : "Archived.")}>{p.side.archived ? "Unarchive" : "Archive"}</button>
          <button type="button" className="button bench-btn-ghost is-small w-button" onClick={() => void set({ muted: !p.side.muted }, p.side.muted ? "Unmuted." : "Muted. No emails for this thread.")}>{p.side.muted ? "Unmute" : "Mute"}</button>
          <button type="button" className="button bench-btn-ghost is-small w-button" onClick={() => void set({ marked_unread: true }, "Marked unread.")}>Mark unread</button>
        </div>
        {msg && <p className="bench-hint" role="status" style={{ margin: 0 }}>{msg}</p>}
      </div>

      <div className="bench-card is-white bench-stack" style={{ gap: 10 }}>
        <h2 className="bench-eyebrow" style={{ margin: 0 }}>Private notes</h2>
        {p.notes.length === 0 && <p className="bench-hint" style={{ margin: 0 }}>Only your team sees notes.</p>}
        <ul className="bench-plainlist" style={{ gap: 8 }}>
          {p.notes.map((n) => (
            <li key={n.id} className="bench-small"><span style={{ whiteSpace: "pre-wrap" }}>{n.body}</span><br /><span className="bench-muted">{n.author} · {time(n.created_at)}</span>
              {n.mine && <> · <button type="button" className="bench-link-btn" onClick={async () => { await deleteNote(n.id, p.conversationId); p.refresh(); }}>Delete</button></>}
            </li>
          ))}
        </ul>
        <form onSubmit={async (e) => { e.preventDefault(); const r = await addNote(p.conversationId, note); if (r.ok) { setNote(""); p.refresh(); } }} className="bench-stack" style={{ gap: 8 }}>
          <label htmlFor="note" className="bench-sr-only">Add a note</label>
          <textarea id="note" className="bench-input" style={{ minHeight: 70 }} value={note} maxLength={4000} placeholder="Add a note for your team" onChange={(e) => setNote(e.target.value)} />
          <div><button className="button bench-btn-ghost is-small w-button" type="submit">Add note</button></div>
        </form>
      </div>

      <div className="bench-card is-white bench-stack" style={{ gap: 10 }}>
        {mode === "none" && (
          <div className="bench-row" style={{ gap: 8 }}>
            {p.myOrgType === "broker" && !p.declined && <button type="button" className="button bench-btn-ghost is-small w-button" onClick={() => setMode("decline")}>Decline</button>}
            <button type="button" className="button bench-btn-ghost is-small w-button" onClick={() => setMode("report")}>Report or block</button>
          </div>
        )}
        {mode === "decline" && (
          <form className="bench-stack" style={{ gap: 10 }} onSubmit={async (e) => { e.preventDefault(); const r = await declineConversation(p.conversationId, reason, detail); if (r.ok) p.refresh(); else setMsg(r.error ?? null); }}>
            <label className="bench-label" htmlFor="decline-reason">Reason</label>
            <select id="decline-reason" className="bench-input" value={reason} onChange={(e) => setReason(e.target.value)}>{DECLINE_REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            <label className="bench-label" htmlFor="decline-note">Note to the brand (optional)</label>
            <textarea id="decline-note" className="bench-input" style={{ minHeight: 70 }} value={detail} maxLength={1000} onChange={(e) => setDetail(e.target.value)} />
            <p className="bench-hint" style={{ margin: 0 }}>The brand sees a polite closed message. The thread closes for both sides.</p>
            <div className="bench-row"><button className="button is-small w-button" type="submit">Decline conversation</button><button className="button bench-btn-ghost is-small w-button" type="button" onClick={() => setMode("none")}>Cancel</button></div>
          </form>
        )}
        {mode === "report" && (
          <form className="bench-stack" style={{ gap: 10 }} onSubmit={async (e) => { e.preventDefault(); const r = await reportConversation(p.conversationId, detail); setMsg(r.ok ? "Report sent to Purvey." : r.error ?? null); if (r.ok) setMode("none"); }}>
            <label className="bench-label" htmlFor="report-reason">What happened?</label>
            <textarea id="report-reason" className="bench-input" style={{ minHeight: 70 }} value={detail} maxLength={2000} onChange={(e) => setDetail(e.target.value)} />
            <p className="bench-hint" style={{ margin: 0 }}>Purvey can read this thread only after a report, and every read is logged.</p>
            <div className="bench-row">
              <button className="button is-small w-button" type="submit">Send report</button>
              <button className="button bench-btn-ghost is-small w-button" type="button" onClick={async () => { const r = await blockOrg(p.conversationId, p.otherOrgId); setMsg(r.ok ? `Blocked ${p.otherName}. They can't message you.` : r.error ?? null); setMode("none"); p.refresh(); }}>Block {p.otherName}</button>
              <button className="button bench-btn-ghost is-small w-button" type="button" onClick={() => setMode("none")}>Cancel</button>
            </div>
          </form>
        )}
      </div>
    </aside>
  );
}
