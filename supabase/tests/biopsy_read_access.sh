#!/bin/sh
# Disposable local PostgreSQL only; never removes shared-memory segments.
set -eu
cd "$(dirname "$0")/../.."
scratch=$(mktemp -d /tmp/manta-biopsy.XXXXXX)
cleanup() { pg_ctl -D "$scratch/db" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$scratch"; }
trap cleanup EXIT HUP INT TERM
mkdir "$scratch/socket"
initdb -U postgres -D "$scratch/db" --auth=trust --no-locale > "$scratch/init.log"
if ! pg_ctl -D "$scratch/db" -l "$scratch/server.log" -o "-k $scratch/socket -h '' -p 55457" start; then
 cat "$scratch/server.log"; exit 1
fi
export PGHOST="$scratch/socket" PGPORT=55457 PGUSER=postgres PGDATABASE=biopsy_test
createdb "$PGDATABASE"
psql -Xq -v ON_ERROR_STOP=1 -f supabase/tests/fixtures/biopsy_read_access.sql
python3 supabase/tests/biopsy_read_access.py
