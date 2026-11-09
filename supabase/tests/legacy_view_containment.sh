#!/bin/sh
# Disposable PostgreSQL only. No TCP, live credentials, or Supabase connection.
set -eu
cd "$(dirname "$0")/../.."
scratch=$(mktemp -d /tmp/legacy-view-acl.XXXXXX)
cleanup() { pg_ctl -D "$scratch/db" -m immediate stop >/dev/null 2>&1 || true; }
trap cleanup EXIT HUP INT TERM
mkdir "$scratch/socket"
initdb -D "$scratch/db" -U postgres --auth=trust --no-locale > "$scratch/init.log"
pg_ctl -D "$scratch/db" -l "$scratch/server.log" -o "-k $scratch/socket -h '' -p 55463" start >/dev/null
psql -X -h "$scratch/socket" -p 55463 -U postgres -d postgres -v ON_ERROR_STOP=1 -f supabase/tests/legacy_view_containment.sql
