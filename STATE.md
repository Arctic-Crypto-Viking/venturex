# State — New Venture

As known on 2026-10-18. This is the one file here that changes weekly: update it
whenever a line below stops being true.

## Where it stands

| Area | State | Source |
|---|---|---|
| Repo | `Arctic-Crypto-Viking/venturex`, created by the founder on 18 Oct 2026; B0 and B1 built in the cloud session from `docs/HANDOFF.md` (atlas-os PR #3) and pushed to `main`. The repo is named venturex; the product's working name stays "New Venture" until the founder decides (HANDOFF §10 D1). | this repo |
| Core | `core/` = git subtree of `platform-core`, now at branch `core/agents-module-and-admin-cut` (641f3e8, 18 Oct): the admin/audit cut as `core_007` + `core_009` (done first by the InvestX session at 13:27 UTC; the cut made here at the same time was dropped, so it exists once), the agents module `core_030` (not applied here; B7), and `core_018` plan reads (added by this session, from artist-platform PR #1 — it closed two suite failures: anyone could read any account's plan status). All of it is platform-core PR #1, open. Migrations here: 001, 003, 007, 009, 020, 024 verbatim, 007 reference data, 018. | `supabase/migrations/`, `core/`, platform-core PR #1 |
| Database | No hosted project yet. Eight migrations (001–008) run green on a fresh local Postgres 16 with the RLS suite: 26 checks, the zero-leak scan over 12 tenant tables, the superadmin path audited, the feedback board, delete account (`supabase/tests/local/run.sh`, 18 Oct). | the build session |
| App | Builds and lints (18 Oct). Sign-in, Continue, admin console (404 for non-superadmins), feedback board, `/privacy`, the landing page from the sketch, `/app` home placeholder. Checked at 390 px in all five looks, Dark and Bright: no horizontal overflow; `/admin` answers 404 to a visitor. No door yet (B2). | `npm run build && npm run lint`; screenshots in the build session |
| Deployment | None. Supabase project (Frankfurt), superadmin flag, Vercel, subdomain: the founder's steps, `docs/HANDOFF.md` §9. | — |
| Name, seller, prices | Working name "New Venture"; the seller company and every price undecided (HANDOFF §10 D1–D3). No price shown anywhere. | `src/brand.ts` |

## Next three actions

1. **Founder:** create the Supabase project (Frankfurt) and `.env.local` (HANDOFF §9 steps 2–3); say when it exists, then `npx supabase db push` applies 001–006.
2. **Claude:** B2 — the door (`docs/HANDOFF.md` §4, §5, §6, §8 B2), with the unit test that `door.ts` and `compute_verdict` agree, and the suite's product checks.
3. **Founder:** exit test 1 after B2: ten of his own ideas through the door on a phone.

## Not known to this repo

- The design page "New Venture — service concept" (9 Oct): read for screen copy before B2.
- Whether the founder has answered D1–D3 (name and subdomain, seller, where free ends).

## Waiting on the founder

- (Done 18 Oct: the repository exists as `Arctic-Crypto-Viking/venturex`; B0 and B1 are pushed to `main`.)
- Decisions D1–D3 (defaults in HANDOFF §10 apply meanwhile); D2 stops any outgoing mail and the paid test.
- The merge of platform-core PR #1 (the admin/audit cut, the agents module, plan reads) — one branch for InvestX and New Venture. A redundant branch `core-007-admin-audit` in platform-core (this session's, superseded) could not be deleted through the proxy: delete it on GitHub.
