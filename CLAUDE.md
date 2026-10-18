# New Venture

Working name; `src/brand.ts` is the one place the name and addresses are written.

The door every idea goes through — GO, PARKED or KILLED with the reason in writing —
and the workspace that takes a GO to its first paying customer. Built on the platform
core (`core/`, a git subtree of `Arctic-Crypto-Viking/platform-core`); the method is the
`venture-os` plugin in `atlas-os`. Full brief: `docs/HANDOFF.md` (18 Oct 2026).

## Status (18 Oct 2026)

B0 (this repo) and B1 (the shell on the core: sign-in, admin console, feedback board,
five looks, five languages, privacy page; core SQL 001, 003, 007, 020, 024 plus the
product's reference data; RLS suite green on a fresh Postgres) are built in the cloud
session. Nothing is applied to a hosted database and nothing is deployed: the Supabase
project, the superadmin flag, Vercel and the subdomain are the founder's steps
(`docs/HANDOFF.md` §9). Next: B2, the door (`docs/HANDOFF.md` §8). `STATE.md` has the
detail; `DECISIONS.md` the decisions.

## Read first, in this order

1. `docs/HANDOFF.md` — what to build, what is reused, the rules as code (§4), the data
   model (§5), the screens (§6), the build order with exit tests (§8), the open
   decisions with their defaults (§10).
2. `core/README.md` — how a product consumes the core. Never fork a core file into
   `src/`; change it in `core/` and `git subtree push`.
3. `supabase/migrations/*.sql` — the schema is the truth.
4. `STATE.md`, `DECISIONS.md` — where things stand, what was decided and why.

## Stack and layout

- **Platform core is `core/`** (`core/README.md`): looks + design selector, sign-in,
  admin console, entitlement/auth helpers, Supabase clients, proxy, feedback board,
  i18n. Imported as `@core/*`; core reads the product only through `src/product.tsx`
  (`@product`).
- Next.js 16 (App Router, TypeScript, Tailwind v4) at the repo root, `src/`. **Read
  `node_modules/next/dist/docs/` before using an API — this version differs from
  training data** (`proxy.ts` replaced middleware; `cookies()` is async;
  `LayoutProps` / `PageProps` are global types).
- Supabase Postgres + Auth + RLS, project region **eu-central-1 (Frankfurt)**; Vercel
  functions in Frankfurt (`vercel.json`, `fra1`). Sign-in links use `type=email` and
  never sign in on GET (`/auth/confirm` → `/auth/continue`, one button).
- `supabase/migrations/` (timestamped, applied with the Supabase CLI; append-only) ·
  `supabase/tests/rls_isolation.sql` + `supabase/tests/local/run.sh` (the auth shim
  comes with `core/`).
- **Product name and addresses: `src/brand.ts`** (`ProductBrand`); `company` there is
  the data controller named on `/privacy` — to be decided (HANDOFF §10 D2).
- **Languages**: `en` · `nb` · `es` · `de` · `fr`. Product words in `src/i18n/*.ts`
  (English is the type; `tsc` fails on a missing key); `es`, `de`, `fr` carry English
  until translated. Core's words in `core/src/i18n`.
- **Design**: tokens and the five looks in `core/src/styles/core.css`, imported by
  `src/app/globals.css`; components in `core/src/components/ui.tsx`; the mark in
  `src/components/brand.tsx` (geometry in `src/components/mark-shape.ts`). Pages
  compose these; no raw palette classes.
- Entitlements: `core/src/lib/entitlements.ts` (`getEntitlements`, `hasFeature`,
  `featureValue`, `consumeQuota`); what a customer may be told is in
  `src/lib/plan-summary.ts` (`LIVE_FEATURES`). The door's rules, versioned:
  `src/lib/door.ts` (B2).

## Commands

```bash
npm run dev            # http://localhost:3000 (needs .env.local — see .env.example)
npm run build && npm run lint
npm test               # unit tests (node:test via tsx)
npx supabase db push   # founder, last step, after the suite is green
supabase/tests/local/run.sh -h <host> -p <port> -U postgres   # fresh DB → migrations → RLS suite
node scripts/dev-login-link.mjs you@example.com                # a sign-in link without e-mail
```

## Rules that are not up for interpretation

1. **RLS on every tenant table**, keyed on membership via `app.is_member(account_id)`.
   New table with `account_id` → policies in the same migration → nothing added to the
   suite's exclusion list (it scans every table with `account_id`). Run the suite before
   pushing any schema change, in the session that builds the migration.
2. **Never trust the client.** UI reads `/api/me/entitlements` to show or hide. Every
   gated server action calls `has_feature()` / `feature_value()` and, for metered
   actions, `consume_quota()` **before** doing the work. A path from the browser
   (`next`, `back`) goes through `safeNext()` before any redirect.
3. **Superadmin is a database fact**, never a token claim: `users.is_superadmin` is set
   only by SQL. `/admin` returns **404** to everyone else. Inside SECURITY DEFINER SQL,
   judge the caller with `app.is_service()` / `app.is_superadmin()` / `app.is_member()`.
4. **Modules and features are data.** New capability = feature row (+ module row) +
   plan values in a migration + code behind `hasFeature(key)`. Never a plan name in code.
5. **Payment rails are decoupled from access.** Only `subscriptions.paid_through`
   grants access; every rail writes `payments`. Manual path (`record_manual_payment`)
   first.
6. **Venture-neutral surfaces.** Nothing a tester or customer can see names another
   venture, link or data. No seed, fixture or default writes a person's name.
7. **Mobile first.** Every screen is designed at phone width and shown in full on every
   device; large tap targets; one question per screen in the door.
8. **Migrations are append-only.** Never edit an applied migration. Reference data
   changes are migrations too — or admin-console edits.
9. **Secrets never enter the repo.** `.env.local` only; `SUPABASE_SECRET_KEY` is
   server-only.
10. **The door's rules are versioned code.** A verdict is computed, stored with its
    rules version, never edited. A KILLED venture is re-scored only with a stated
    changed fact.
11. **A test's numbers are set before it runs and immutable after.**
12. **The cap lives in the database**: three LIVE, one with the hours, per owner.
13. **No price on any screen** until the founder decides one (HANDOFF §10 D3).
14. **Nothing is AI** until the core engine exists (HANDOFF §3.4); then every AI result
    carries its disclosure and `/privacy` names the provider first.
15. **"Atlas"** never appears in anything a tester or customer can see.

## How the founder works (apply to every task)

- Share a short plan of the steps before starting non-trivial work.
- Be direct; separate facts from assumptions; when flagging a problem, propose the
  smarter way forward.
- Verify setup steps before giving them (run the command, read the doc).
- Prioritise the fastest real-world test: the exit tests in `docs/HANDOFF.md` §8.
- Close with a short "To record" block; stop before anything that merges, deploys,
  applies a migration to a hosted database, creates a service, pays or sends.

## Build order and where we are

| Step | Scope | Status |
|---|---|---|
| B0 | repo, `CLAUDE.md`, `STATE.md`, `DECISIONS.md`, `docs/HANDOFF.md`, `assumptions.md`, `later.md` | built 18 Oct |
| B1 | shell on the core; core SQL 001/003/007/020/024 + reference data; RLS suite | built 18 Oct · founder's hosted steps pending |
| B2 | the door: `ventures`, `door_runs`, `evidence`, `decisions`, `tests`, `create_venture`, `record_door_run`, the `/door/*` screens, `/app`, the card | next |
| B3 | the workspace: stages, ledger, decisions, tests, offer, team | |
| B4 | the record moves to the product | |
| B5 | forecast log + Monday review mail (Resend) | |
| B6 | a second founder (invite a tester) | |
| B7 | AI inside, when the core engine exists | |
| B8 | the first money — the founder's go | |

## Who signs what goes out

Empty until HANDOFF §10 D2 is decided. Nothing goes out before.

*Keep this file current. A stale CLAUDE.md teaches the next session the wrong thing confidently.*
