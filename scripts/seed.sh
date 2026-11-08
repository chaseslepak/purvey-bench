#!/usr/bin/env bash
# Load the reference lists (states, regions, retailers, channels, distributors,
# categories) into $DATABASE_URL. Idempotent. Creates no brokers or brands.
set -euo pipefail
export PGOPTIONS="${PGOPTIONS:-} -c client_min_messages=warning"
: "${DATABASE_URL:?set DATABASE_URL}"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f supabase/seed.sql
echo "reference lists seeded"
