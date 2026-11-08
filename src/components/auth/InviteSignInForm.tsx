"use client";

import { useActionState } from "react";
import { sendInviteLink, type AuthFormState } from "@/app/auth/actions";
import { Turnstile } from "@/components/ui/Turnstile";

export function InviteSignInForm({ token, turnstileSiteKey }: { token: string; turnstileSiteKey: string }) {
  const [state, action, pending] = useActionState<AuthFormState, FormData>(sendInviteLink, undefined);
  return (
    <form action={action} className="bench-form" noValidate>
      <input type="hidden" name="token" value={token} />
      <div className="bench-field">
        <label htmlFor="invite-email" className="bench-label">The email address your invite was sent to</label>
        <input id="invite-email" name="email" type="email" autoComplete="email" required className="bench-input" />
        {state?.fieldErrors?.email && <p className="bench-error">{state.fieldErrors.email}</p>}
      </div>
      <Turnstile siteKey={turnstileSiteKey} />
      {state?.error && <p className="bench-notice is-error" role="alert">{state.error}</p>}
      <div><button type="submit" className="button w-button" disabled={pending}>{pending ? "Sending…" : "Email me a link"}</button></div>
    </form>
  );
}
