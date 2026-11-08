#!/usr/bin/env bash
# Start a throwaway local Postgres 16 for policy tests (no Docker needed).
# Usage: npm run db:local   -> prints the DATABASE_URL to export.
set -euo pipefail
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DATA="${PGDATA_DIR:-$(pwd)/.pgdata}"
PORT="${PGPORT:-54329}"
if [ ! -d "$DATA" ]; then
  mkdir -p "$DATA"
  [ "$(id -u)" = "0" ] && chown -R postgres "$DATA"
  RUN() { if [ "$(id -u)" = "0" ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
  RUN "$PGBIN/initdb -D '$DATA' -U postgres --auth=trust >/dev/null"
fi
RUN() { if [ "$(id -u)" = "0" ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
if ! RUN "$PGBIN/pg_ctl -D '$DATA' status" >/dev/null 2>&1; then
  RUN "$PGBIN/pg_ctl -D '$DATA' -o '-p $PORT -k /tmp' -l '$DATA/log' start" >/dev/null
fi
echo "export DATABASE_URL=postgresql://postgres@localhost:$PORT/postgres"
