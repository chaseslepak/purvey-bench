#!/usr/bin/env bash
# Apply migrations to $DATABASE_URL. With --reset, drop and recreate a local
# test database first (and install the Supabase shim). Production uses
# `supabase db push` instead; see README.
set -euo pipefail
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
: "${DATABASE_URL:?set DATABASE_URL}"
if [ "${1:-}" = "--reset" ]; then
  case "$DATABASE_URL" in *localhost*|*127.0.0.1*) ;; *) echo "refusing to reset a non-local database"; exit 1;; esac
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "drop schema if exists public cascade; drop schema if exists auth cascade; create schema public;"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f scripts/supabase-shim.sql
fi
for f in supabase/migrations/*.sql; do
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"
done
echo "migrations applied"
