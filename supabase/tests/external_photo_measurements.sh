#!/bin/sh
# Disposable PostgreSQL through a private Unix socket only; no live credentials.
set -eu
cd "$(dirname "$0")/../.."
scratch=$(mktemp -d "${TMPDIR:-/tmp}/manta-external-test.XXXXXX")
cleanup() { pg_ctl -D "$scratch/db" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$scratch"; }
trap cleanup EXIT HUP INT TERM
mkdir "$scratch/socket"
initdb -D "$scratch/db" --auth=trust --no-locale > "$scratch/init.log"
pg_ctl -D "$scratch/db" -l "$scratch/server.log" -o "-k $scratch/socket -h '' -p 55440" start >/dev/null
export PGHOST="$scratch/socket" PGPORT=55440 PGDATABASE=external_measurements_test
createdb "$PGDATABASE"
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/fixtures/external_photo_measurements.sql >/dev/null
pg_dump --schema-only | sed '/^\\restrict /d; /^\\unrestrict /d' > "$scratch/before.sql"
psql -X -v ON_ERROR_STOP=1 -f supabase/migrations/20261014224714_persist_external_photo_measurements.sql >/dev/null
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/external_photo_measurements.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/rollback/20261014224714_persist_external_photo_measurements_rollback.sql >/dev/null
pg_dump --schema-only | sed '/^\\restrict /d; /^\\unrestrict /d' > "$scratch/after.sql"
cmp "$scratch/before.sql" "$scratch/after.sql"
echo 'PASS: rollback restored exact previous schema/function/ACLs'
