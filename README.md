# platform-core

The shared backbone of every pasai product (artist platform, InvestX, New Venture,
and whatever comes next): sign-in, accounts, entitlements, the admin console, and
the **five looks with the per-person design selector**. A product gets all of it
by pulling this folder in; it never copies these files by hand.

Lives at `core/` in each product repo as a **git subtree** of
`github.com/Arctic-Crypto-Viking/platform-core`. Plain files: Claude Code, Vercel
and the Mac see ordinary code; nothing to publish, no version to pin.

## What is in here

| Path | What |
|---|---|
| `src/styles/core.css` | Design tokens, the five looks (Nordic · Ember · Lagoon · Orchid · Forest) × Dark/Bright, the `ap-*` header hooks |
| `src/fonts.ts` | The six self-hosted fonts the looks use |
| `src/lib/theme.ts`, `src/actions/theme.ts` | Cookies `ap_theme` / `ap_template`, read on the server, set by a form post |
| `src/components/template-picker.tsx`, `theme-toggle.tsx` | **The design selector** (Look menu) and the Dark/Bright switch — work before hydration |
| `src/lib/i18n.ts` (+ `i18n-shared.ts` for the browser), `src/i18n/`, `src/components/language-picker.tsx`, `src/actions/auth.ts`, `src/components/sign-out-button.tsx` | **Languages**: `en` · `nb` · `es` · `de` · `fr`; the choice is cookie `ap_lang`, until then the browser's `Accept-Language` (`no`/`nn` → `nb`). Core's own words (sign-in, Continue, switches) in `src/i18n/*.ts`, typed by the English file; a product keeps its words in its own dictionaries. **Sign out** as a form post; `product.signOutCookies` clears per-person cookies |
| `src/components/ui.tsx`, `copy-button.tsx` | Buttons, cards, inputs, badges, notices — every page composes these |
| `src/lib/{auth,env,entitlements,safe-next}.ts`, `src/lib/supabase/*` | Session, current user/account, `hasFeature` / `featureValue` / `consumeQuota`, safe redirects, the three Supabase clients |
| `src/lib/sign-in-link.mjs` | `createSignInLink()`: the one-time sign-in link without e-mail (`type=email`, `/auth/confirm` → `/auth/continue`). Used by Invite a tester and by the script. Plain JS so the script runs in plain Node; needs the service-role client |
| `src/proxy.ts` | `createProxy(privatePrefixes)` — session refresh, sign-in redirect, 404 for `/admin` |
| `src/app/login`, `src/app/auth/*` | Sign-in (link + 6-digit code), the one-button Continue page, callback/confirm |
| `src/app/admin/*` | Admin console: Overview, Accounts (+ Invite a tester, detail, View as, Delete account), Feedback, Plans & features, Settings — superadmin only, 404 for everyone else |
| `src/app/app/feedback/*`, `src/lib/feedback-format.ts` | **The feedback board** at `/app/feedback`: people write, Claude Haiku 5.5 tidies it into a title + summary and finds the same suggestion on the board, people vote; at `feedback.vote_threshold` (10) votes it waits for the founder on Admin → Feedback. Needs `core_024` and `ANTHROPIC_API_KEY` (works without the key, untidied) |
| `src/app/api/me/entitlements`, `src/app/api/internal/overview` | Entitlements for the UI; the founder's cross-venture overview (bearer token) |
| `src/product.ts` | **The product contract** — the only thing core needs from a product |
| `scripts/dev-login-link.mjs` | One-time sign-in link without e-mail, in Terminal: the founder's own sign-in, and the fallback for Invite a tester |
| `supabase/tests/local/auth_shim.sql` | Local `auth` schema so the RLS suite runs on plain Postgres |
| `src/agents/{types,runner}.ts` | **The agents module**: the shapes of agent definitions, agents, runs, items and snapshots, the `AgentRunner` contract a product implements, and `runAgent()` — opens a run, calls the runner, closes it with tokens and cost. SQL: `core_030_agents.sql` |
| `supabase/migrations/core_*.sql` | Core SQL that is identical in every product (see "Database" below) |

## Add core to a new product (Next.js 16 app at the repo root, `src/`)

1. Pull it in:
   ```bash
   git subtree add --prefix core https://github.com/Arctic-Crypto-Viking/platform-core.git main --squash
   npm i @supabase/ssr @supabase/supabase-js server-only @anthropic-ai/sdk \
     @fontsource-variable/ibm-plex-sans @fontsource-variable/archivo @fontsource-variable/dm-sans \
     @fontsource-variable/fraunces @fontsource-variable/source-sans-3 @fontsource-variable/manrope
   ```
2. `tsconfig.json` → `compilerOptions`: `"allowImportingTsExtensions": true` and in `paths`
   `"@core/*": ["./core/src/*"]`, `"@product": ["./src/product.tsx"]`.
3. `src/app/globals.css`:
   ```css
   @import "tailwindcss";
   @import "../../core/src/styles/core.css";
   /* product-only rules below */
   ```
4. Root layout `src/app/layout.tsx`: `import "@core/fonts";`, read `getTheme()` / `getTemplate()`
   from `@core/lib/theme`, and render `<html data-theme={theme} data-template={template}>`;
   `generateViewport` returns `themeColor(template, theme)`.
5. `src/product.tsx` exporting `product: ProductConfig` (`@core/product`): the product's
   `brand` (`ProductBrand`: name, domain, `appUrl`, `siteUrl`, tagline, description — every title,
   OG tag and sign-in screen in core reads it; keep the values in the product, never in core),
   `Mark`, `homePath` (`"/app"`), `privatePrefixes`, `privacyPath` (the sign-in page links to it),
   and the admin slots (`ViewAs` is required; `storageBuckets` names the buckets Delete account
   empties, `testerNote` the note sent with an invite).
6. Route files that re-export core (one line each; keep `dynamic` / `metadata` as in
   `artist-platform/src/app/{login,auth,admin,api}`), and `src/proxy.ts`:
   `export const proxy = createProxy(product.privatePrefixes)` plus a **literal** `config.matcher`.
7. The signed-in header uses the hooks, and carries the selector:
   ```tsx
   <div className="ap-shell …">
     <header className="ap-header">
       <div className="ap-header-row">
         <Link href="/app" className="ap-brand"><product.Mark size={24} /><span>{appName}</span></Link>
         <nav className="ap-nav">
           <Link href="/app/x" className="ap-link">…</Link>
           <TemplatePicker template={template} back="/app" />
           <ThemeToggle theme={theme} back="/app" />
         </nav>
       </div>
     </header>
     <div className="ap-content">{children}</div>
   </div>
   ```
   Without these seven class names a look can only recolour; with them it also moves the
   header (Ember band, Lagoon pill, Orchid masthead, Forest sidebar).
8. `scripts/dev-login-link.mjs` → one line: `import "../core/scripts/dev-login-link.mjs";`
8b. **Feedback board**: route files `src/app/app/feedback/page.tsx` and `src/app/admin/feedback/page.tsx`
   (one-line re-exports like the others), a **Feedback** link in the signed-in header (and one a phone
   reaches), `ANTHROPIC_API_KEY` on the server, and Anthropic named as a processor in the product's
   privacy notice: the text people write in Feedback goes to Anthropic (USA) to be reformatted.
9. `npm run build && npm run lint`, then open `/login` at phone width and try all five looks
   in Dark and Bright.

## Conventions every product follows

- The signed-in area is **`/app`** (sign-in falls back to it; the sign-in script links to it).
- Pages compose `@core/components/ui`; no raw palette classes in pages — colours come from tokens.
- Feature keys are `<module>.<name>`; code checks `hasFeature(key)`, never a plan name.
- Nothing a customer sees names another venture.

## Changing core

Change it **here** (in any product's `core/` folder), then:

```bash
git subtree push --prefix core https://github.com/Arctic-Crypto-Viking/platform-core.git main   # send the change up
git subtree pull --prefix core https://github.com/Arctic-Crypto-Viking/platform-core.git main --squash   # in every other product
```

A new slot in `src/product.ts` is a change to every product: add it as optional, or update
all products in the same week. Never import product code from core except through `@product`.

## Database

Supabase CLI only reads a product's own `supabase/migrations/`, and applied migrations are
never moved or edited. So for SQL, core is the **source** a new product copies from, not a
folder the CLI reads:

- `core_001_tenancy.sql`, `core_003_entitlements_billing.sql` — verbatim in every product.
- `core_007_admin_audit.sql`, `core_009_admin_rpcs.sql` — **the admin/audit cut (18 Oct 2026, from
  artist-platform 007 + 009 §2 + 014)**: audit log, flags, `log_audit()`, `app.assert_superadmin()`,
  `admin_list_accounts`, `admin_account_detail`, view-as, plan-feature / entitlement / settings / flag
  RPCs — with no product table named. Product figures come through two hooks a product redefines in
  its own migration: `app.overview_extra()` (tiles on the Overview) and `app.admin_account_extra(uuid)`
  (keys on an account's list row and detail). First used verbatim by InvestX (its migrations 003 and 004);
  artist-platform still runs its own 007/009/014 and moves to these when it next touches them.
- `core_030_agents.sql` — **the agents module (18 Oct 2026)**: `agent_definitions` (a product seeds its
  catalogue), `agents` (one person's agent: focus in `config`, confirmation text stored, quota
  `agents.max` enforced by a trigger), `agent_runs` (tokens and cost per run), `agent_items` (the
  person's thread: alerts, updates, answers, tickets), `collector_snapshots` (shared data, kept forever),
  `social_sources` / `social_items` / `social_signals` (the social data collector shared with Mainfloor),
  and the RPCs `create_agent`, `set_agent_status`, `agent_quota`, `admin_agent_costs`. Needs 001, 003
  and 009. Runs after 020/024 in a product's order.
- `core_018_plan_reads.sql` — `is_entitled()` / `effective_plan_id()` answer only for accounts the caller
  may read (artist-platform PR #1's 018, 2 Oct 2026; taken first by New Venture on 18 Oct 2026, whose RLS
  suite showed that any signed-in person, and visitors, could read any account's plan status with the core
  as it stood). Verbatim in every product, after 003; Mainfloor gets it with PR #1 or as its own migration.
- `core_024_feedback.sql` — the feedback board (artist-platform 024, 16 Oct 2026): `feedback_items`,
  `feedback_votes`, the view `feedback_board`, the person's RPCs and the audited `admin_feedback_*`.
  Not tenant data (no `account_id`). Needs `app.set_updated_at` (001), `app.is_service` /
  `app.is_superadmin` (001), `log_audit` (007), `app.assert_superadmin` (009), and works with 020.
- `core_020_admin_delete_account.sql` — `admin_delete_account()`, behind **Admin → Accounts →
  Delete account** (artist-platform 020, 15 Oct 2026). Verbatim in every product, as its next
  migration number. It names no product table (tables and user references come from the
  catalogue), but it needs the admin/audit SQL below that is not cut yet: `audit_log`,
  `log_audit()`, `app.current_impersonation()` (007) and `app.assert_superadmin()` (009). The
  product says which Storage buckets hold an account's files: `admin.storageBuckets` in
  `src/product.tsx`.
- Still to cut (needs a session with Postgres so the RLS suite runs green, PLATFORM-CORE §4
  rule 4): the generalised admin/audit and admin RPCs (`app.overview_extra`,
  `app.admin_account_extra`, `admin_list_accounts`, `admin_account_detail`, settings/flag/grant
  RPCs). Today they exist as artist-platform 007 + 009 + 014 with artist code mixed in.
  A new product before that cut copies those three files and replaces the hook bodies.
