"use client";

import { useActionState } from "react";
import { saveAway, saveNotifications, saveProfile, saveTemplate, type Result } from "./actions";

const Status = ({ r }: { r: Result }) => (r?.error ? <p className="bench-notice is-error" role="alert" style={{ margin: 0 }}>{r.error}</p> : r?.ok ? <p className="bench-hint" role="status" style={{ margin: 0 }}>{r.ok}</p> : null);

export function ProfileForm({ name, phone, email }: { name: string; phone: string; email: string }) {
  const [r, action, pending] = useActionState(saveProfile, undefined);
  return (
    <form action={action} className="bench-form">
      <div className="bench-grid-2">
        <div className="bench-field"><label className="bench-label" htmlFor="s-name">Name</label><input id="s-name" name="name" className="bench-input" defaultValue={name} autoComplete="name" required /></div>
        <div className="bench-field"><label className="bench-label" htmlFor="s-phone">Phone</label><input id="s-phone" name="phone" type="tel" className="bench-input" defaultValue={phone} autoComplete="tel" /></div>
      </div>
      <p className="bench-hint" style={{ margin: 0 }}>Signed in as {email}.</p>
      <Status r={r} />
      <div><button className="button is-small w-button" disabled={pending}>Save</button></div>
    </form>
  );
}

export function NotificationsForm({ freq, weekly, isBroker }: { freq: string; weekly: boolean; isBroker: boolean }) {
  const [r, action, pending] = useActionState(saveNotifications, undefined);
  return (
    <form action={action} className="bench-form">
      <fieldset className="bench-field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="bench-label" style={{ marginBottom: 8 }}>Email me about new messages</legend>
        <div className="bench-choice-group" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          {[["instant", "Right away"], ["daily", "Daily digest"], ["off", "Off"]].map(([v, l]) => (
            <label key={v} className="bench-choice"><input type="radio" name="freq" value={v} defaultChecked={freq === v} /><span style={{ fontWeight: 500 }}>{l}</span></label>
          ))}
        </div>
      </fieldset>
      {isBroker && <label className="bench-row" style={{ gap: 8 }}><input type="checkbox" name="weekly" defaultChecked={weekly} /> Weekly summary of views and conversations</label>}
      {!isBroker && <input type="hidden" name="weekly" value={weekly ? "on" : ""} />}
      <Status r={r} />
      <div><button className="button is-small w-button" disabled={pending}>Save email settings</button></div>
    </form>
  );
}

export function TemplateForm() {
  const [r, action, pending] = useActionState(saveTemplate, undefined);
  return (
    <form action={action} className="bench-form">
      <div className="bench-field"><label className="bench-label" htmlFor="t-title">Title</label><input id="t-title" name="title" className="bench-input" maxLength={120} placeholder="e.g. Intro with line card" required /></div>
      <div className="bench-field"><label className="bench-label" htmlFor="t-body">Reply</label><textarea id="t-body" name="body" className="bench-input" maxLength={10000} required /></div>
      <Status r={r} />
      <div><button className="button is-small w-button" disabled={pending}>Add template</button></div>
    </form>
  );
}

export function AwayForm({ message, notTaking }: { message: string; notTaking: boolean }) {
  const [r, action, pending] = useActionState(saveAway, undefined);
  return (
    <form action={action} className="bench-form">
      <div className="bench-field">
        <label className="bench-label" htmlFor="away-msg">Auto-reply</label>
        <textarea id="away-msg" name="message" className="bench-input" maxLength={1000} defaultValue={message} placeholder="e.g. We're at Expo West until March 14 and will reply when we're back." />
        <p className="bench-hint" style={{ margin: 0 }}>Sent once when a brand starts a new conversation. Leave empty to turn it off.</p>
      </div>
      <label className="bench-row" style={{ gap: 8 }}><input type="checkbox" name="notTaking" defaultChecked={notTaking} /> Not taking new lines (shows a notice on your profile; you stay listed)</label>
      <Status r={r} />
      <div><button className="button is-small w-button" disabled={pending}>Save away mode</button></div>
    </form>
  );
}
