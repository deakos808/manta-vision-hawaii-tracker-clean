#!/bin/sh
# Private socket, disposable local database only. Never connects to Supabase.
set -eu
cd "$(dirname "$0")/../.."
scratch=$(mktemp -d "/tmp/manta-boundary.XXXXXX")
cleanup() { pg_ctl -D "$scratch/db" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$scratch"; }
trap cleanup EXIT HUP INT TERM
mkdir "$scratch/socket"
initdb -U postgres -D "$scratch/db" --auth=trust --no-locale > "$scratch/init.log"
if ! pg_ctl -D "$scratch/db" -l "$scratch/server.log" -o "-k $scratch/socket -h '' -p 55455" start; then
 cat "$scratch/server.log"; exit 1
fi
export PGHOST="$scratch/socket" PGPORT=55455 PGUSER=postgres PGDATABASE=measurement_boundary_test
createdb "$PGDATABASE"
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/permanent_measurement_containment.sql
