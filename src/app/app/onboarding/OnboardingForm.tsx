"use client";

import { useActionState, useState } from "react";
import { completeOnboarding, type FormState } from "../actions";

type Props = {
  states: { code: string; name: string }[];
  defaults: { type?: "brand" | "broker"; name: string; orgName: string };
  next?: string;
};

export function OnboardingForm({ states, defaults, next }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(completeOnboarding, undefined);
  const [type, setType] = useState(defaults.type);
  const err = (k: string) => state?.fieldErrors?.[k];
  const described = (k: string) => (err(k) ? `${k}-error` : undefined);
  // Sign-up already asked who they are; don't ask again unless something's missing or they want to change it.
  const known = Boolean(defaults.type && defaults.name && defaults.orgName);
  const [editingState, setEditing] = useState(!known);
  const editing = editingState || Boolean(err("type") || err("name") || err("orgName"));
  return (
    <form action={action} className="bench-form" noValidate>
      {next && <input type="hidden" name="next" value={next} />}
      {!editing && (
        <div className="bench-card bench-stack" style={{ padding: 20, gap: 6 }}>
          <input type="hidden" name="type" value={type} />
          <input type="hidden" name="name" value={defaults.name} />
          <input type="hidden" name="orgName" value={defaults.orgName} />
          <p style={{ margin: 0 }}>Setting up <strong>{defaults.orgName}</strong> as a {type === "broker" ? "brokerage" : "brand"}, for {defaults.name}.</p>
          <div><button type="button" className="bench-link-btn" onClick={() => setEditing(true)}>Change</button></div>
        </div>
      )}
      {editing && <>
      <fieldset className="bench-field" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="bench-label" style={{ marginBottom: 8 }}>I am a…</legend>
        <div className="bench-choice-group">
          {(["brand", "broker"] as const).map((t) => (
            <label key={t} className="bench-choice">
              <input type="radio" name="type" value={t} checked={type === t} onChange={() => setType(t)} />
              <span className="bench-choice_title">{t === "brand" ? "Brand" : "Broker"}</span>
            </label>
          ))}
        </div>
        {err("type") && <p id="type-error" className="bench-error">{err("type")}</p>}
      </fieldset>
      <div className="bench-field">
        <label htmlFor="name" className="bench-label">Your name</label>
        <input id="name" name="name" defaultValue={defaults.name} required className="bench-input" autoComplete="name" aria-invalid={Boolean(err("name"))} aria-describedby={described("name")} />
        {err("name") && <p id="name-error" className="bench-error">{err("name")}</p>}
      </div>
      <div className="bench-field">
        <label htmlFor="orgName" className="bench-label">{type === "broker" ? "Brokerage name" : "Brand name"}</label>
        <input id="orgName" name="orgName" defaultValue={defaults.orgName} required className="bench-input" autoComplete="organization" aria-invalid={Boolean(err("orgName"))} aria-describedby={described("orgName")} />
        {err("orgName") && <p id="orgName-error" className="bench-error">{err("orgName")}</p>}
      </div>
      </>}
      <div className="bench-field">
        <label htmlFor="website" className="bench-label">Website <span className="bench-muted">(optional)</span></label>
        <input id="website" name="website" inputMode="url" placeholder="https://" className="bench-input" aria-invalid={Boolean(err("website"))} aria-describedby={described("website")} />
        {err("website") && <p id="website-error" className="bench-error">{err("website")}</p>}
      </div>
      <div className="bench-grid-2">
        <div className="bench-field">
          <label htmlFor="hqCity" className="bench-label">HQ city</label>
          <input id="hqCity" name="hqCity" className="bench-input" autoComplete="address-level2" />
        </div>
        <div className="bench-field">
          <label htmlFor="hqState" className="bench-label">HQ state</label>
          <select id="hqState" name="hqState" className="bench-input" defaultValue="">
            <option value="">Choose…</option>
            {states.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}
          </select>
        </div>
      </div>
      {state?.error && <p className="bench-notice is-error" role="alert">{state.error}</p>}
      <button type="submit" className="button bench-btn-block w-button" disabled={pending}>
        {pending ? "Saving…" : "Continue"}
      </button>
    </form>
  );
}
