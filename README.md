# Venturex

The door every idea goes through — GO, PARKED or KILLED, with the reason in writing — and
the workspace that takes a GO to its first paying customer. Built on the platform core
(`core/`, a git subtree of `platform-core`). Home: `venturex.aintegration.org` (decided
19 Oct 2026; not deployed yet).

- Start here: `CLAUDE.md`, then `STATE.md`; the design in `docs/HANDOFF.md` (18 Oct 2026),
  the concept and the founder's ventures in `docs/concept.md`, the screen copy in
  `docs/design/`, the market in `docs/research/competition-analysis/`.
- Run locally: copy `.env.example` to `.env.local` (values from the Supabase dashboard),
  `npm install`, `npm run dev`, open http://localhost:3000. The anonymous door (`/door/start`)
  runs without a database; saving a verdict and `/app` need one. A sign-in link without
  e-mail: `node scripts/dev-login-link.mjs you@example.com`.
- Tests: `npm test` (the door's rules, and that the SQL fixture is in step with them);
  `supabase/tests/local/run.sh -h <host> -p <port> -U postgres` on a plain Postgres 16 (fresh
  database → migrations → the 20-run door fixture against `compute_verdict()` → the RLS suite,
  45 checks) — never against a Supabase project. `npm run build && npm run lint`.
- Database: `npx supabase link --project-ref <ref>` once, then `npx supabase db push` after
  the suite ran green. Nine migrations: core 001–008, the door 009.
- Deploy: Vercel, region `fra1` (`vercel.json`), the three Supabase variables.
