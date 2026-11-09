#!/bin/sh
# Disposable PostgreSQL only: private Unix socket, no TCP or live credentials.
set -eu
cd "$(dirname "$0")/../.."
scratch=$(mktemp -d /tmp/postview1-base-acl.XXXXXX)
cleanup() { pg_ctl -D "$scratch/db" -m immediate stop >/dev/null 2>&1 || true; }
trap cleanup EXIT HUP INT TERM
mkdir "$scratch/socket"
initdb -D "$scratch/db" -U postgres --auth=trust --no-locale > "$scratch/init.log"
pg_ctl -D "$scratch/db" -l "$scratch/server.log" -o "-k $scratch/socket -h '' -p 55464" start >/dev/null
psql -X -h "$scratch/socket" -p 55464 -U postgres -d postgres -v ON_ERROR_STOP=1 -f supabase/tests/postview1_base_containment.sql
