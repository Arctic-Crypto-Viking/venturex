# State — New Venture

As known on 2026-10-18. This is the one file here that changes weekly: update it
whenever a line below stops being true.

## Where it stands

| Area | State | Source |
|---|---|---|
| Repo | Created 18 Oct 2026 from `docs/HANDOFF.md` (atlas-os PR #3). B0 and B1 built in the cloud session. | this repo |
| Core | `core/` = git subtree of `platform-core` `main` at `3390113` (17 Oct). Core SQL copied verbatim: 001, 003, 020, 024; **007 (admin/audit) cut here from artist-platform 007 + 009 + 014** and pushed to `platform-core` as a branch for the founder's merge. | `supabase/migrations/`, `core/` |
| Database | No hosted project yet. The migrations run green on a fresh local Postgres 16 (`supabase/tests/local/run.sh`): migrations + the RLS suite. | the build session |
| App | Builds and lints. Sign-in, Continue, admin console (404 for non-superadmins), feedback board, `/privacy`, the landing page, `/app` home placeholder. No door yet (B2). | `npm run build && npm run lint` |
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

- The empty `new-venture` repository on GitHub (the session cannot create one) — then the push.
- Decisions D1–D3 (defaults in HANDOFF §10 apply meanwhile); D2 stops any outgoing mail and the paid test.
- The merge of `platform-core`'s `core_007_admin_audit` branch, so InvestX takes the same file.
