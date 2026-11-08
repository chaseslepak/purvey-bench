import type { Metadata } from "next";
import { acceptInvite } from "@/app/app/actions";
import { InviteSignInForm } from "@/components/auth/InviteSignInForm";
import { env } from "@/lib/env";
import { getSession } from "@/lib/session";

const ERRORS: Record<string, string> = {
  email: "This invite was sent to a different email address. Sign in with that address to accept it.",
  member: "You already belong to an organization. Each person can belong to one.",
  type: "This invite is for a different kind of organization than your account.",
  invalid: "This invite is invalid or has expired. Ask your teammate for a new one.",
};

export const metadata: Metadata = { title: "Join your team", robots: { index: false } };

export default async function Invite({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const session = await getSession();
  return (
    <section className="bench-section is-cream">
      <div className="bench-stack" style={{ maxWidth: "36rem" }}>
        <div className="text_title">Team invite</div>
        <h1 className="bench-h-section">Join your team on Purvey Bench</h1>
        {error && ERRORS[error] && <p className="bench-notice is-error" role="alert">{ERRORS[error]}</p>}
        {session ? (
          session.org ? (
            <p className="bench-lede">You already belong to {session.org.name}. Each person can belong to one organization.</p>
          ) : (
            <form action={acceptInvite}>
              <input type="hidden" name="token" value={token} />
              <button type="submit" className="button w-button">Accept invite</button>
            </form>
          )
        ) : (
          <>
            <p className="bench-lede">Enter the email address the invite was sent to. We&rsquo;ll email you a link that brings you back here to accept.</p>
            <InviteSignInForm token={token} turnstileSiteKey={env.turnstileSiteKey} />
          </>
        )}
      </div>
    </section>
  );
}
