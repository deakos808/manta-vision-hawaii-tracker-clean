#!/bin/sh
# Disposable PostgreSQL only. Requires local initdb/pg_ctl/psql/pg_dump on PATH.
# No Supabase credentials, TCP listener, Docker, or live scientific data.
set -eu
cd "$(dirname "$0")/../.."
for executable in initdb pg_ctl createdb psql pg_dump; do command -v "$executable" >/dev/null; done
scratch=$(mktemp -d "${TMPDIR:-/tmp}/manta-pending-test.XXXXXX")
cleanup() {
  pg_ctl -D "$scratch/db" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$scratch"
}
trap cleanup EXIT HUP INT TERM
mkdir "$scratch/socket"
initdb -D "$scratch/db" --auth=trust --no-locale > "$scratch/init.log"
pg_ctl -D "$scratch/db" -l "$scratch/server.log" -o "-k $scratch/socket -h '' -p 55439" start >/dev/null
export PGHOST="$scratch/socket" PGPORT=55439 PGDATABASE=jon_pending_test
createdb "$PGDATABASE"
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/fixtures/pending_submission_editing.sql >/dev/null
psql -X -v ON_ERROR_STOP=1 -f supabase/migrations/20261005070057_sighting_submission_ownership.sql >/dev/null
psql -X -v ON_ERROR_STOP=1 -v baseline=true -f supabase/tests/pending_submission_editing.sql
pg_dump --schema-only | sed '/^\\restrict /d; /^\\unrestrict /d' > "$scratch/before.sql"
psql -X -v ON_ERROR_STOP=1 -f supabase/migrations/20261013055511_edit_pending_sighting_submissions.sql >/dev/null
pg_dump --schema-only | sed '/^\\restrict /d; /^\\unrestrict /d' > "$scratch/pre-conflict.sql"
psql -X -v ON_ERROR_STOP=1 -f supabase/migrations/20261014074119_return_pending_edit_conflicts_without_retry.sql >/dev/null
psql -X -v ON_ERROR_STOP=1 -v baseline=false -f supabase/tests/pending_submission_editing.sql
psql -X -v ON_ERROR_STOP=1 -f supabase/rollback/20261014074119_return_pending_edit_conflicts_without_retry_rollback.sql >/dev/null
pg_dump --schema-only | sed '/^\\restrict /d; /^\\unrestrict /d' > "$scratch/post-conflict.sql"
cmp "$scratch/pre-conflict.sql" "$scratch/post-conflict.sql"
echo 'PASS: conflict rollback restored exact prior schema and privileges'
psql -X -v ON_ERROR_STOP=1 -f supabase/rollback/20261013055511_edit_pending_sighting_submissions_rollback.sql >/dev/null
pg_dump --schema-only | sed '/^\\restrict /d; /^\\unrestrict /d' > "$scratch/after.sql"
cmp "$scratch/before.sql" "$scratch/after.sql"
echo 'PASS: rollback restored the exact fixture schema and privileges'
