# State — Venturex

As known on 2026-10-19, 08:30 Oslo. This is the one file here that changes weekly: update it
whenever a line below stops being true.

## Where it stands

| Area | State | Source |
|---|---|---|
| Name | **Venturex**, at `venturex.aintegration.org` (founder, 19 Oct; HANDOFF §10 D1 decided). In `src/brand.ts`, `package.json`, the module registry (migration 009), every doc. The claude.ai project, the canvas and `docs/HANDOFF.md` keep "New Venture" as the title of a dated record. | DECISIONS.md |
| Repo | `Arctic-Crypto-Viking/venturex`, `main`. B0, B1 (18 Oct, cloud session) and B2 (19 Oct, this Mac) pushed. | this repo |
| Core | `core/` = git subtree of `platform-core` at branch `core/agents-module-and-admin-cut` (641f3e8, 18 Oct): `core_007` + `core_009` (admin/audit), `core_030` (agents; not applied here, B7), `core_018` (plan reads). Migrations here: 001, 003, 007, 009, 020, 024 verbatim, 007 reference data, 018 → files 001–008; plus **009 the door**. platform-core PR #1 still open. | `supabase/migrations/`, `core/` |
| Database | No hosted project yet. Nine migrations run green on a fresh local Postgres 16 with the door fixture (20 runs, `compute_verdict()` = `src/lib/door.ts`) and the RLS suite: **45 checks** — the zero-leak scan over 17 tenant tables, the superadmin path, the feedback board, delete account, and the door's own (a GO with the hours and the test, a gate kill, Conscious Pulse at PARKED 13/25, the killed re-score rule, the saved cap, the LIVE cap, immutable test numbers, the state only through the door, decisions append-only, anon reads nothing). | `supabase/tests/local/run.sh -h localhost -p 5432 -U postgres`, 19 Oct |
| App | `npm run build`, `npm run lint`, `npx tsc --noEmit`, `npm test` (7) green, 19 Oct. The door walked at 390 px in the Nordic look: `/door/start` → five lines → five gates → five scores (demand asks for the named person from level 3) → the verdict; the sketch's sample gives GO 18/25 "At the bar" with the test form and the card's fields. `/app`, `/app/v/[id]`, `/app/new`, View as and the admin tiles are built but not exercised against a database (none exists). | the build session |
| Deployment | None. The founder's steps below. | — |
| Seller, prices | Undecided (HANDOFF §10 D2, D3). No price shown anywhere. `company` in `src/brand.ts` says "to be named". | `src/brand.ts` |
| Project material | In the repo since 19 Oct: `docs/concept.md`, `docs/design/` (the canvas copy, the first sketch as text), `docs/research/competition-analysis/` (the 3 Oct doc, five tabs). | this repo |

## The founder's steps (verified against `core/README.md` and the suite; nothing here is done by a session)

1. **Supabase project**, region eu-central-1 (Frankfurt). Keys into `.env.local`
   (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
   `NEXT_PUBLIC_SITE_URL`). Then `npx supabase link --project-ref <ref>` and
   `npx supabase db push` (nine migrations; the suite is green). The free plan pauses a project
   after seven idle days; resume it in the dashboard before a push.
2. **First sign-in**: `node scripts/dev-login-link.mjs <his e-mail>` (creates his `public.users`
   row on the first visit). Then in the Supabase SQL editor, in this order:
   ```sql
   update public.users set is_superadmin = true where lower(email) = lower('<his e-mail>');
   ```
   and, after his first venture is saved through the door (that creates his first account),
   the comped founder plan on it — without it the account counts as free (3 saved ventures)
   and the hooks of exit test 1 (ten ideas) stop at three:
   ```sql
   insert into public.subscriptions (account_id, plan_id, term_months, status, provider, notes)
   select a.id, p.id, 12, 'comped', 'manual', 'Founder account — comped'
     from public.accounts a, public.plans p
    where a.owner_user_id = (select id from public.users where lower(email) = lower('<his e-mail>'))
      and p.key = 'founder';
   update public.accounts set plan_id = (select id from public.plans where key = 'founder')
    where owner_user_id = (select id from public.users where lower(email) = lower('<his e-mail>'));
   ```
   Every later venture of his takes the plan and the comp over (`create_venture`, DECISIONS 19 Oct).
3. **Vercel**: a project from the repo, `vercel.json` has `fra1`; the three Supabase variables
   (not `NEXT_PUBLIC_SITE_URL`: Vercel's own address is used until the subdomain is set).
   Then one DNS record at Domeneshop for `venturex.aintegration.org` and Supabase Auth's Site URL
   and Redirect URLs (`https://venturex.aintegration.org/auth/callback`). `signup.open` stays on
   until the first stranger should be kept out (then Invite a tester, as InvestX does).
4. **Exit test 1** (HANDOFF §8 B2): ten of his own ideas through the door on a phone, saved under
   his account, Conscious Pulse among them with the 13 Oct answers (demand 2, time 4, price 3,
   edge 2, margin 2 → PARKED 13/25). Then: what did the door get wrong, where did he overrule it
   — into `DECISIONS.md`; a rule change only through `DOOR_RULES_VERSION`.

## Next build steps

1. **B3, the workspace** (HANDOFF §8): `stage_progress` + history, `offers`,
   `/app/v/[id]/{stages,ledger,decisions,tests,offer,team}`, `set_week_test` (moves the hours),
   `record_test_result` as a screen, `invite_member`, plan gating (`venture.workspace`,
   `venture.members_max`), `/admin/ventures`, the country-rules checklist before a test.
2. The founder reviews the Norwegian gate wording (`src/i18n/nb.ts`) before the first tester.
3. `platform-core` PR #1 merge, then `git subtree pull` here and in artist-platform.

## Not known to this repo

- Whether the founder has answered D2 (the seller) and D3 (where free ends). Defaults apply.
- The InvestX regulatory check (D11): a rules-check item on InvestX's first test when it goes
  through the door.

## Open issues

- A redundant branch `core-007-admin-audit` in platform-core (superseded) could not be deleted
  through the proxy: delete it on GitHub.
- The PostgREST error for a cap carries the number in `detail`; the screens read the plan's own
  figure instead (`door.errors`, `{n}` from the message). Fine until a plan has a different cap.
