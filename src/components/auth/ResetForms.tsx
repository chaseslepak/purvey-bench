"use client";

import { useActionState } from "react";
import { sendPasswordReset, setPassword, type AuthFormState, type PasswordState } from "@/app/auth/actions";

export function ResetRequestForm() {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(sendPasswordReset, undefined);
  const e = state?.fieldErrors?.email;
  return (
    <form action={action} className="bench-form" noValidate>
      <div className="bench-field">
        <label htmlFor="email" className="bench-label">Work email</label>
        <input id="email" name="email" type="email" autoComplete="email" required className="bench-input" aria-invalid={Boolean(e)} aria-describedby={e ? "email-error" : undefined} />
        {e && <p id="email-error" className="bench-error">{e}</p>}
      </div>
      {state?.error && <p className="bench-notice is-error" role="alert">{state.error}</p>}
      <button type="submit" className="button bench-btn-block w-button" disabled={pending}>{pending ? "Sending…" : "Email me a reset link"}</button>
    </form>
  );
}

/** New password + confirm. Used in Settings and as the last step of a reset. */
export function SetPasswordForm({ label = "Save password", done }: { label?: string; done?: React.ReactNode }) {
  const [state, action, pending] = useActionState<PasswordState, FormData>(setPassword, undefined);
  if (state?.ok && done) return <div className="bench-stack"><p className="bench-notice" role="status" style={{ margin: 0 }}>{state.ok}</p>{done}</div>;
  return (
    <form action={action} className="bench-form" noValidate>
      <input type="text" name="username" autoComplete="username" hidden readOnly />
      <div className="bench-grid-2">
        <div className="bench-field">
          <label htmlFor="pw-new" className="bench-label">New password</label>
          <input id="pw-new" name="password" type="password" autoComplete="new-password" minLength={8} required className="bench-input" aria-describedby="pw-hint" />
        </div>
        <div className="bench-field">
          <label htmlFor="pw-confirm" className="bench-label">Confirm password</label>
          <input id="pw-confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required className="bench-input" />
        </div>
      </div>
      <p id="pw-hint" className="bench-hint" style={{ margin: 0 }}>At least 8 characters. You can still sign in with an emailed link any time.</p>
      {state?.error && <p className="bench-notice is-error" role="alert" style={{ margin: 0 }}>{state.error}</p>}
      {state?.ok && <p className="bench-notice" role="status" style={{ margin: 0 }}>{state.ok}</p>}
      <div><button type="submit" className="button is-small w-button" disabled={pending}>{pending ? "Saving…" : label}</button></div>
    </form>
  );
}
