#!/usr/bin/env bash
# Local verification: fresh database → auth shim (from core/) → migrations → RLS suite.
# Usage: supabase/tests/local/run.sh [psql connection args…]
# Example (the cloud build session): supabase/tests/local/run.sh -h /var/lib/postgresql/ap-sock -p 54329 -U postgres
# Example (a Mac with Homebrew Postgres 16): supabase/tests/local/run.sh -h localhost -p 5432 -U postgres
# Never point this at a Supabase project: the shim would collide with the real auth schema.
set -euo pipefail
cd "$(dirname "$0")/../../.."
PSQL=(psql -v ON_ERROR_STOP=1 -q "$@")
DB=venturex_test

"${PSQL[@]}" -d postgres -c "drop database if exists $DB;" -c "create database $DB;"
PSQL=(psql -v ON_ERROR_STOP=1 -q "$@" -d "$DB")

echo "→ auth shim (local only, from core/)"
"${PSQL[@]}" -f core/supabase/tests/local/auth_shim.sql

for f in supabase/migrations/*.sql; do
  echo "→ $f"
  "${PSQL[@]}" -1 -f "$f"
done

# No blanket "grant all" here: the shim sets Supabase's default privileges
# before the migrations run, exactly as Supabase does, so a migration's own
# revokes survive as they do in prod.

echo "→ door rules fixture (compute_verdict vs src/lib/door.ts)"
"${PSQL[@]}" -f supabase/tests/door_fixture.sql

echo "→ test users (no seed: this product writes no person's name and no venture by default)"
"${PSQL[@]}" -c "insert into auth.users (email, raw_user_meta_data) values ('owner@example.test', '{}'), ('tester@example.test', '{}') on conflict do nothing;"

echo "→ RLS isolation suite"
"${PSQL[@]}" -v owner_email=owner@example.test -v tester_email=tester@example.test -f supabase/tests/rls_isolation.sql
echo "✓ all green"
