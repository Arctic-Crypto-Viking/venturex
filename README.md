# New Venture

The door every idea goes through — GO, PARKED or KILLED, with the reason in writing — and
the workspace that takes a GO to its first paying customer. Built on the platform core
(`core/`, a git subtree of `platform-core`).

- Start here: `CLAUDE.md`, then `docs/HANDOFF.md`.
- Run locally: copy `.env.example` to `.env.local` (values from the Supabase dashboard),
  `npm install`, `npm run dev`, open http://localhost:3000. A sign-in link without e-mail:
  `node scripts/dev-login-link.mjs you@example.com`.
- Database: `npx supabase link --project-ref <ref>` once, then `npx supabase db push` after
  the RLS suite ran green (`supabase/tests/local/run.sh -h <host> -p <port> -U postgres`
  on a plain Postgres 16 — never against a Supabase project).
- Deploy: Vercel, region `fra1` (`vercel.json`), the three Supabase variables.
