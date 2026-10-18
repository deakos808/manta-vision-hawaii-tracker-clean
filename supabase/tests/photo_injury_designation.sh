#!/bin/sh
# Synthetic data, private Unix socket, no credentials or TCP listener.
set -eu
cd "$(dirname "$0")/../.."
scratch=$(mktemp -d "${TMPDIR:-/tmp}/manta-injury-test.XXXXXX")
cleanup() { pg_ctl -D "$scratch/db" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$scratch"; }
trap cleanup EXIT HUP INT TERM
mkdir "$scratch/socket"
initdb -D "$scratch/db" --auth=trust --no-locale > "$scratch/init.log"
pg_ctl -D "$scratch/db" -l "$scratch/server.log" -o "-k $scratch/socket -h '' -p 55441" start >/dev/null
export PGHOST="$scratch/socket" PGPORT=55441 PGDATABASE=photo_injury_test
createdb "$PGDATABASE"
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/fixtures/external_photo_measurements.sql >/dev/null
psql -X -v ON_ERROR_STOP=1 -f supabase/migrations/20261014224714_persist_external_photo_measurements.sql >/dev/null
# Load the actual active biopsy wrapper unchanged; only its surrounding schema is synthetic.
python3 - "$scratch/biopsy.sql" <<'PYWRAPPER'
from pathlib import Path
import sys
s=Path('supabase/migrations/20261005081610_harden_submission_approval.sql').read_text()
a=s.index('CREATE OR REPLACE FUNCTION public.commit_sighting_submission_with_biopsies')
b=s.index('$function$;',s.index('AS $function$',a))+len('$function$;')
Path(sys.argv[1]).write_text(s[a:b])
PYWRAPPER
psql -X -v ON_ERROR_STOP=1 -f "$scratch/biopsy.sql" >/dev/null
psql -X -v ON_ERROR_STOP=1 -f supabase/tests/photo_injury_designation.sql
