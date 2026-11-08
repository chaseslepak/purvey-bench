# Purvey Bench

A broker directory for CPG brands, owned by Purvey CPG. Brands search food and beverage brokers by the retailers, regions, channels and distributors they actually cover, and contact them for free. Brokers pay a flat $100 a month to be listed.

Production: `https://bench.purveycpg.com`, embedded in Webflow at `https://purveycpg.com/bench`.

## Business rules (enforced in the database, not just the UI)

1. Brands are free, always.
2. Brokers pay $100/month, flat. No tiers, caps, lead fees or paid placement.
3. Only brands start conversations. Brokers can't list brands, read briefs or message first.
4. Ranking is by fit score only. Payment never changes position.
5. A listing is visible only while its subscription is active (or in grace, or comped by an admin).
6. Only Purvey admins verify listings.
7. References are admin-only. Briefs are visible only to the brand's own team.
8. Placements and commission audits are Purvey services; the app only collects requests.

Changes to these need Chase's approval.

## Stack

| Need | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 16 (App Router), React 19, TypeScript | `src/proxy.ts` is Next 16's replacement for `middleware.ts` |
| Styling | Vendored Webflow stylesheet + CSS custom-property tokens + plain CSS | **Not Tailwind**: see "Design system" below |
| Data, auth, storage, realtime | Supabase (Postgres + RLS, magic link + Google) | |
| Validation | zod 4 on every server action | |
| Bot protection | Cloudflare Turnstile | sign-up and invite sign-up (first message in phase 4) |
| Tests | Vitest (unit + SQL policy tests on real Postgres), Playwright (visual diff, embed, a11y) | |
| Billing, email, errors | Stripe, Resend, Sentry | phases 2, 4 and 6 |

## Design system

The app must be indistinguishable from purveycpg.com, so the live site *is* the design system:

- `src/styles/webflow.css` is the live Webflow stylesheet, **vendored verbatim** (`purvey-cpg.webflow.shared.dcaac4516.css`). The header, footer and CTA band use the exact Webflow markup and class names, so they render identically. To pick up a Webflow redesign, replace this file and re-run `npm run test:visual`.
- `src/styles/tokens.css` holds the tokens, each one **measured from the live site** with `getComputedStyle`. Where the live site differs from the written brief, the live value wins. Notably, the CTA band and footer radius is 20px (the brief said 24px), and the footer is `#1D1D1D`.
- `src/styles/app.css` holds the app components (`bench-*` classes: cards, forms, tables, tags, notices), built only from those tokens and Webflow classes.
- **Why not Tailwind:** Webflow defines `.text-sm`, `.text-4xl`, `.hide`, `.button` and others that collide with Tailwind utilities, and those collisions silently restyled the footer. Plain CSS keeps the stylesheet verbatim and pixel-exact.
- Light theme only. Breakpoints are Webflow's: 991, 767 and 479px.

Shared chrome lives in `src/components/site/`: `SiteHeader`, `SiteFooter` and `CtaBand` (all link to the main site with the same URLs), plus `BenchNav`, the app's own bar under the header.

## Local setup

```bash
npm install
```

```bash
cp .env.example .env.local
```

Fill in `.env.local` (see below), then:

```bash
npm run dev
```

Without Supabase keys the public pages still render, and sign-in shows a "not configured" message.

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | all | `https://bench.purveycpg.com` in production; used for magic-link and OAuth redirects |
| `NEXT_PUBLIC_MAIN_SITE_URL` | all | `https://www.purveycpg.com`; header and footer links |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | all | Supabase project; the anon key is safe in the browser because RLS protects the data |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Stripe webhooks and cron (phase 2+). **Never** expose it to the client |
| `COOKIE_DOMAIN` | server | `.purveycpg.com` in production, so the session works inside the purveycpg.com iframe; empty on localhost |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | all / server | Turnstile. Without the secret, verification passes in development and **fails closed in production** |
| `DATABASE_URL` | tests | Local Postgres for policy tests |

### Supabase project setup

1. Apply the migrations, then load the reference lists. Both are idempotent.

   ```bash
   supabase link --project-ref <ref>
   ```

   ```bash
   supabase db push
   ```

   ```bash
   DATABASE_URL="<connection string>" npm run seed
   ```

   The seed creates 51 states/DC, 5 regions, 94 retailers, 27 distributors, 31 categories and 14 channels. It creates **no** brokers, brands or users.
2. **Auth → URL configuration:** set the Site URL to `https://bench.purveycpg.com` and add `https://bench.purveycpg.com/auth/confirm` and `/auth/callback` (plus the `localhost:3000` equivalents) as redirect URLs.
3. **Auth → Email templates → Magic link:** point the link at the confirm route. It uses `token_hash`, so it works even when opened on a different device:
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}`
4. **Auth → Providers → Google:** enable it with a Google OAuth client whose redirect URI is `https://<ref>.supabase.co/auth/v1/callback`.
5. **Auth → SMTP:** use Resend's SMTP (`smtp.resend.com`) with a verified purveycpg.com domain, so sign-in mail comes from Purvey. Branded React Email templates arrive in phase 4.
6. Make the first admin with SQL: `update public.users set is_admin = true where email = 'chase@…';`

## Database

Migrations live in `supabase/migrations/`:

- `…0100_schema.sql`: every table in the brief, plus a few needed to enforce the rules (see "Deviations").
- `…0200_rls.sql`: helper functions, integrity triggers, grants and policies. **Deny by default:** all privileges are revoked from `anon` and `authenticated`, then granted back table by table, and column by column where a role may only edit some fields. RLS is enabled on every table.
- `…0300_functions.sql`: RPCs (`create_organization`, invites, `submit_listing`, `sync_listing_status`, `reveal_contact`, verification, `decline_conversation`, `admin_read_thread`, analytics, reference merges). Each one checks the caller itself and is granted explicitly.

Rules that must hold even for server code run as **triggers**, which also fire for the service role. For example, only a member of a brand organization can insert a conversation, and the brief summary is always built from the brand's own brief.

## Tests

```bash
npm test
```

Unit tests (open-redirect guard; fit score lands in phase 3).

```bash
eval "$(npm run -s db:local)"
```

Starts a throwaway local Postgres 16 on port 54329 (no Docker) and exports `DATABASE_URL`.

```bash
npm run test:db
```

Runs **52 row-level-security tests**. They rebuild the database from the migrations and seed, install a small shim that reproduces Supabase's roles and `auth.uid()` (`scripts/supabase-shim.sql`), create two brands, a live and a draft brokerage and an admin, then check every rule as each role. That includes acceptance test 3: a broker inserting a conversation, reading a brief or listing brands is refused at the database.

```bash
npm run build && npx playwright test --trace off
```

Runs 35 browser tests:

- `tests/visual/` is **acceptance test 9**, the visual diff against the live purveycpg.com at 1440, 1280, 991, 767 and 479px. For the header, CTA band and footer it checks:
  - every element's box (±0.5px),
  - the pixels, allowing only 1px sub-pixel glyph jitter, with at most 0.5% of pixels differing,
  - the computed type and button styles.

  Side-by-side `live | bench | diff` images land in `tests/visual/__output__/`.
- `tests/e2e/embed.spec.ts` checks embedded mode, that purveycpg.com may frame the app and any other origin is refused (real CSP check in Chromium), that Google opens at the top level, the security headers, and the auth redirect.
- `tests/e2e/a11y.spec.ts` runs axe WCAG 2.1 AA on every public page and checks keyboard operation of both menus.

## Embedding in Webflow

- The app sends `Content-Security-Policy: frame-ancestors 'self' https://purveycpg.com https://www.purveycpg.com`. Nothing else may frame it, and `X-Frame-Options` is intentionally not set.
- Inside an iframe (or with `?embed=1`), a script in `<head>` marks `<html data-embed="1">` before first paint. That hides the app's own header, footer and CTA band, because Webflow already shows them. The Bench bar stays visible.
- Session cookies use `Domain=.purveycpg.com; SameSite=Lax`. bench.purveycpg.com and purveycpg.com are the same site, so the session works inside the frame.
- Google sign-in links use `target="_top"`, so Google never loads inside the frame.
- **Phase 6** adds the Webflow Custom Code snippet: a full-width iframe, a postMessage resize script so there's never a double scrollbar, and deep links via `?path=`.

## Build phases

1. **Foundation** (this PR): theme, chrome, visual diff, auth, organizations, schema + RLS + policy tests, seed.
2. Broker listing builder and Stripe billing.
3. Brand search, profiles, briefs with fit ranking, saved brokers.
4. Messaging, realtime inbox, email notifications.
5. Admin console.
6. Embed and launch.
