#!/bin/sh
# Local disposable PostgreSQL only; no network listener or live credentials.
set -eu
cd "$(dirname "$0")/../.."
scratch=$(mktemp -d /tmp/manta-match-containment.XXXXXX)
cleanup() { pg_ctl -D "$scratch/db" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$scratch"; }
trap cleanup EXIT HUP INT TERM
mkdir "$scratch/socket"
initdb -D "$scratch/db" -U postgres --auth=trust --no-locale > "$scratch/init.log"
if ! pg_ctl -D "$scratch/db" -l "$scratch/server.log" -o "-k $scratch/socket -h '' -p 55454" start; then
  cat "$scratch/server.log"
  exit 1
fi
psql -X -h "$scratch/socket" -p 55454 -U postgres -d postgres -v ON_ERROR_STOP=1 -f supabase/tests/match_result_diagnostics.sql
