#!/bin/sh
# Disposable PostgreSQL only: private Unix socket, no TCP or live credentials.
set -eu
cd "$(dirname "$0")/../.."
scratch=$(mktemp -d /tmp/legacy-support-acl.XXXXXX)
cleanup() { pg_ctl -D "$scratch/db" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$scratch"; }
trap cleanup EXIT HUP INT TERM
mkdir "$scratch/socket"
initdb -D "$scratch/db" -U postgres --auth=trust --no-locale > "$scratch/init.log"
pg_ctl -D "$scratch/db" -l "$scratch/server.log" -o "-k $scratch/socket -h '' -p 55462" start >/dev/null
psql -X -h "$scratch/socket" -p 55462 -U postgres -d postgres -v ON_ERROR_STOP=1 -f supabase/tests/legacy_import_support_containment.sql
