"use client";

import { useActionState } from "react";
import { inviteTeammate, type FormState } from "../actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(inviteTeammate, undefined);
  return (
    <form action={action} className="bench-form" noValidate>
      <div className="bench-grid-2">
        <div className="bench-field">
          <label htmlFor="invite-email" className="bench-label">Email</label>
          <input id="invite-email" name="email" type="email" required className="bench-input" />
          {state?.fieldErrors?.email && <p className="bench-error">{state.fieldErrors.email}</p>}
        </div>
        <div className="bench-field">
          <label htmlFor="invite-role" className="bench-label">Role</label>
          <select id="invite-role" name="role" className="bench-input" defaultValue="member">
            <option value="member">Member</option>
            <option value="owner">Owner</option>
          </select>
        </div>
      </div>
      {state?.error && <p className="bench-notice is-error" role="alert">{state.error}</p>}
      {state?.ok && (
        <div className="bench-notice" role="status">
          {state.sent ? "Invite emailed. If it doesn't arrive, send them this link (it expires in 14 days):" : "Invite created. Send this link to your teammate (it expires in 14 days):"}
          <input readOnly className="bench-input" style={{ marginTop: 8 }} value={state.ok} aria-label="Invite link" onFocus={(e) => e.currentTarget.select()} />
        </div>
      )}
      <div><button type="submit" className="button is-small w-button" disabled={pending}>{pending ? "Creating…" : "Create invite"}</button></div>
    </form>
  );
}
