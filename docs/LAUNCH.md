# Purvey Bench launch checklist

Status as of the Phase 4 PR. ✅ = done, ☐ = to do (who).

## 1. DNS (Chase, wherever purveycpg.com's DNS is managed)

Add these records. They don't affect the main website or your existing email.

**App domain**

| Type | Host | Value |
| --- | --- | --- |
| CNAME | `bench` | `cb1030bc9802fc77.vercel-dns-016.com` |

✅ `bench.purveycpg.com` is already added to the Vercel project; it goes live as soon as this record resolves (HTTPS is automatic).

**Email sending (Resend)**: domain added in Resend, waiting for these:

| Type | Host | Value | Priority |
| --- | --- | --- | --- |
| TXT | `resend._domainkey` | `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCuZSHVQvDAn0U1Wt/etI6T+1Uv2bFLeSe4yy3g9FMVVYNvH6VgzEtKh5LEAMqb3RKEOuXk0AqEEdupfMYLiihiVk/FKSnUlaTY1IaybM4D2BBJ3DMck9z5COHSwkLvoZXP2bbj4Sxci+OUZomG9YyIOsUHuY+EEJrfrfmLdnPcMQIDAQAB` |  |
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com` | 10 |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` |  |
| CNAME | `rsend` | `send.forge.rmta.net` |  |

Hosts are relative to purveycpg.com (e.g. `send` = send.purveycpg.com).

## 2. Keys only Chase can enter

- ☐ **Stripe secret key in Vercel**: Settings → Environment Variables → `STRIPE_SECRET_KEY`. Preview: the `sk_test_…` key. Production: the `sk_live_…` key at launch.
- ☐ **Turnstile keys**: Cloudflare → Turnstile → add site `bench.purveycpg.com` (and `purveycpg.com`). Put the site key in `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and the secret in `TURNSTILE_SECRET_KEY` (Production). Previews already use Cloudflare's test keys.
- ☐ **Google sign-in**: Google Cloud → OAuth client (Web), redirect URI `https://aqwhyyiroopivjlmxorl.supabase.co/auth/v1/callback`. Paste the client ID and secret into Supabase → Authentication → Providers → Google.

## 3. Claude does once the above is in

- ☐ Verify purveycpg.com in Resend → set `EMAIL_FROM=Purvey Bench <bench@purveycpg.com>` for production, and point Supabase's sign-in emails at Resend SMTP (removes the 2-emails-per-hour limit).
- ☐ Create the Stripe webhook endpoint `https://bench.purveycpg.com/api/stripe/webhook` and set `STRIPE_WEBHOOK_SECRET` (test, then live).
- ☐ Live mode: re-create the Bench Listing product, price and portal settings in Stripe live mode.

## 4. Decisions and content (Chase)

- ☐ Merge the PRs in order (#1 → #4 …). Production deploys from `main`.
- ☐ Terms of Service and Privacy Policy from counsel (`/terms`, `/privacy` are placeholders).
- ☐ A sample UNFI and a sample KeHE sales report (for the commission true-up).
- ☐ The open questions on PR #1 (CTA band contrast; brokers seeing their own references).

## Done

- ✅ Supabase: all migrations, reference lists, sign-in settings and email templates, storage buckets and policies, realtime policies.
- ✅ Stripe test mode: Bench Listing 00/month (lookup key `bench_listing_monthly`), Customer Portal settings.
- ✅ Vercel: framework, Node 22, Supabase keys, cookie domain, cron secret, Resend sending-only key, unsubscribe secret, test-mode email for previews.
- ✅ Resend: purveycpg.com added (waiting for DNS).
