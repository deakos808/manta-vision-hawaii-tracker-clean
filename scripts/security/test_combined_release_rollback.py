#!/usr/bin/env python3
"""Verify the canonical combined rollback in a disposable local PostgreSQL cluster."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import socket
import subprocess
import tempfile
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
BASELINE = ROOT / "supabase/tests/combined_release_rollback_baseline.sql"
MIGRATIONS = [
    ROOT / "supabase/migrations/20260816124142_user_access_management.sql",
    ROOT / "supabase/migrations/20261001064839_import_authorization_containment.sql",
    ROOT / "supabase/migrations/20261001150410_organic_biopsy_entry_and_legacy_retirement.sql",
    ROOT / "supabase/migrations/20261001153752_harden_organic_biopsy_integrity.sql",
]
ROLLBACK = ROOT / "supabase/rollback/20261001162000_security_containment_combined_fail_closed_rollback.sql"
ADMIN_ID = "10000000-0000-4000-8000-000000000001"
USER_ID = "10000000-0000-4000-8000-000000000002"

SEED_SQL = f"""
select set_config('request.jwt.claim.sub', '{ADMIN_ID}', false);
update public.biopsies
set created_at = timestamptz '2020-01-01 00:00:00+00',
    updated_at = timestamptz '2020-01-01 00:00:00+00'
where pk_biopsy_id = -1;
insert into auth.users (id, email, created_at, updated_at)
values
  ('{ADMIN_ID}', 'admin@example.invalid', timestamptz '2026-01-01 00:00:00+00', timestamptz '2026-01-01 00:00:00+00'),
  ('{USER_ID}', 'user@example.invalid', timestamptz '2026-01-01 00:00:00+00', timestamptz '2026-01-01 00:00:00+00');
update public.profiles set role = 'admin' where id = '{ADMIN_ID}';

insert into public.catalog (pk_catalog_id, name) values (501, 'Synthetic rollback catalog');
insert into public.sightings (
  pk_sighting_id, sighting_date, start_time, end_time, photographer, island,
  sitelocation, latitude, longitude, notes, total_mantas_biopsied
) values (
  601, date '2026-01-02', '08:00', '09:00', 'Synthetic Researcher',
  'Synthetic Island', 'Synthetic Site', 0, 0, 'rollback fixture', 1
);
insert into public.mantas (
  pk_manta_id, fk_sighting_id, fk_catalog_id, submission_manta_id
) values (701, 601, 501, 'synthetic-manta-correlation');
insert into public.photos (
  pk_photo_id, fk_manta_id, fk_sighting_id, fk_catalog_id,
  storage_path, file_name2, photo_view, is_best_manta_ventral_photo
) values (
  801, 701, 601, 501, 'synthetic/rollback/photo.jpg',
  'photo.jpg', 'ventral', true
);
insert into public.biopsies (
  pk_biopsy_id, fk_manta_id, fk_sighting_id, fk_catalog_id, sample_date,
  sample_time, collector, method, island, region, location, tissue_type,
  lab_id, notes, source, raw_sample_id, created_at, updated_at
) values (
  901, 701, 601, 501, date '2026-01-02', time '08:30',
  'Synthetic Collector', 'synthetic method', 'Synthetic Island',
  'Synthetic Region', 'Synthetic Site', 'synthetic tissue', 'SYN-LAB-1',
  'rollback fixture', 'organic_sighting', 'SYN-SAMPLE-1',
  timestamptz '2026-01-02 18:30:00+00', timestamptz '2026-01-02 18:30:00+00'
);
insert into public.sighting_submissions (
  id, submitted_at, email, sighting_date, manta_count, photo_count,
  payload, status, committed_at, committed_pk_sighting_id
) values (
  '10000000-0000-4000-8000-000000000010',
  timestamptz '2026-01-02 18:00:00+00', 'submitter@example.invalid',
  date '2026-01-02', 1, 1,
  '{{"mantas":[{{"id":"synthetic-manta-correlation","biopsy":{{"collected":true,"sampleDate":"2026-01-02","sampleTime":"08:30","collector":"Synthetic Collector","method":"synthetic method","tissueType":"synthetic tissue","labId":"SYN-LAB-1","sampleId":"SYN-SAMPLE-1","notes":"rollback fixture"}}}}]}}'::jsonb,
  'committed', timestamptz '2026-01-02 18:31:00+00', 601
);
insert into public.stg_drone_photos (import_batch_id, source_file, row_no, raw)
values ('10000000-0000-4000-8000-000000000020', 'synthetic-drone.csv', 1,
        '{{"drone_lat":"0","drone_lon":"0"}}'::jsonb);
insert into public.drone_photos (id) values (1001);
insert into public.stg_import_errors (import_batch_id, source_file, row_no, raw)
values ('10000000-0000-4000-8000-000000000020', 'synthetic-drone.csv', 2,
        '{{"synthetic":"control"}}'::jsonb);
insert into storage.objects (id, bucket_id, name, metadata, created_at, updated_at)
values (
  '10000000-0000-4000-8000-000000000040', 'synthetic-bucket',
  'synthetic/rollback/object.jpg', '{{"size":123}}'::jsonb,
  timestamptz '2026-01-02 18:00:00+00', timestamptz '2026-01-02 18:00:00+00'
);
"""

TABLE_KEYS = {
    "auth.users": "id::text",
    "public.profiles": "id::text",
    "public.user_access_audit": "id::text",
    "public.catalog": "pk_catalog_id::text",
    "public.sightings": "pk_sighting_id::text",
    "public.mantas": "pk_manta_id::text",
    "public.photos": "pk_photo_id::text",
    "public.biopsies": "pk_biopsy_id::text",
    "public.sighting_submissions": "id::text",
    "public.stg_biopsies": "id::text",
    "public.stg_drone_photos": "id::text",
    "public.stg_import_errors": "coalesce(import_batch_id::text,'') || ':' || coalesce(row_no::text,'')",
    "public.drone_photos": "id::text",
    "storage.objects": "id::text",
}


class HarnessError(RuntimeError):
    pass


def executable(name: str) -> str:
    value = shutil.which(name)
    if not value:
        raise HarnessError(f"missing-local-tool:{name}")
    return value


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class Cluster:
    def __init__(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="manta-combined-rollback-", dir="/private/tmp"))
        self.data = self.tmp / "data"
        self.port = free_port()
        self.started = False

    def run(self, args: list[str], *, check: bool = True, timeout: int = 60) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(args, text=True, capture_output=True, timeout=timeout)
        if check and result.returncode != 0:
            raise HarnessError(f"local-command-failed:{Path(args[0]).name}")
        return result

    def start(self) -> None:
        self.run([executable("initdb"), "-D", str(self.data), "-A", "trust", "--no-locale"])
        self.run([
            executable("pg_ctl"), "-D", str(self.data), "-l", str(self.tmp / "postgres.log"),
            "-o", f"-p {self.port} -k {self.tmp}", "start",
        ])
        self.started = True

    def stop(self) -> None:
        if self.started:
            self.run([executable("pg_ctl"), "-D", str(self.data), "stop", "-m", "fast"], check=False)
            self.started = False
        shutil.rmtree(self.tmp, ignore_errors=True)

    def create_db(self, name: str) -> None:
        self.run([executable("createdb"), "-h", str(self.tmp), "-p", str(self.port), name])

    def psql(
        self,
        db: str,
        *,
        sql: str | None = None,
        file: Path | None = None,
        check: bool = True,
        timeout: int = 60,
    ) -> subprocess.CompletedProcess[str]:
        args = [
            executable("psql"), "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1",
            "-h", str(self.tmp), "-p", str(self.port), "-d", db,
        ]
        if file is not None:
            args.extend(["-f", str(file)])
        elif sql is not None:
            args.extend(["-c", sql])
        else:
            raise HarnessError("psql-input-missing")
        return self.run(args, check=check, timeout=timeout)


def prepare_candidate(cluster: Cluster, db: str) -> None:
    cluster.psql(db, file=BASELINE)
    for migration in MIGRATIONS:
        cluster.psql(db, file=migration)


def seed_candidate(cluster: Cluster, db: str) -> None:
    cluster.psql(db, sql=SEED_SQL)


def snapshot(cluster: Cluster, db: str) -> dict[str, dict[str, object]]:
    result: dict[str, dict[str, object]] = {}
    for table, order_key in TABLE_KEYS.items():
        raw = cluster.psql(
            db,
            sql=f"select coalesce(jsonb_agg(to_jsonb(t) order by {order_key}), '[]'::jsonb)::text from {table} t;",
        ).stdout.strip()
        parsed = json.loads(raw)
        canonical = json.dumps(parsed, sort_keys=True, separators=(",", ":")).encode()
        result[table] = {
            "count": len(parsed),
            "sha256": hashlib.sha256(canonical).hexdigest(),
        }
    return result


def metadata_state(cluster: Cluster, db: str) -> str:
    return cluster.psql(
        db,
        sql="""
          select jsonb_build_object(
            'organic_wrapper', to_regprocedure('public.commit_sighting_submission_with_biopsies(uuid)') is not null,
            'drone_wrapper', to_regprocedure('public.fn_imports_commit_drone_photos(uuid)') is not null,
            'drone_private', to_regprocedure('private.fn_imports_commit_drone_photos_impl(uuid)') is not null,
            'validator_hash', md5(pg_get_functiondef('private.validate_sighting_submission_biopsies()'::regprocedure)),
            'auth_staging', has_table_privilege('authenticated','public.stg_drone_photos','SELECT')
          )::text;
        """,
    ).stdout.strip()


def expect_failure(cluster: Cluster, db: str, sql: str, category: str) -> None:
    result = cluster.psql(db, sql=sql, check=False)
    if result.returncode == 0:
        raise HarnessError(f"expected-denial-missing:{category}")


def assert_equal(actual: object, expected: object, category: str) -> None:
    if actual != expected:
        raise HarnessError(category)


def verify_fail_closed(cluster: Cluster, db: str) -> None:
    checks = cluster.psql(
        db,
        sql="""
          select jsonb_build_object(
            'organic_absent', to_regprocedure('public.commit_sighting_submission_with_biopsies(uuid)') is null,
            'drone_public_absent', to_regprocedure('public.fn_imports_commit_drone_photos(uuid)') is null,
            'biopsy_public_absent', to_regprocedure('public.fn_imports_commit_biopsies(uuid)') is null,
            'biopsy_private_absent', to_regprocedure('private.fn_imports_commit_biopsies_impl(uuid)') is null,
            'drone_private_present', to_regprocedure('private.fn_imports_commit_drone_photos_impl(uuid)') is not null,
            'drone_private_anon_denied', not has_function_privilege('anon','private.fn_imports_commit_drone_photos_impl(uuid)','EXECUTE'),
            'drone_private_user_denied', not has_function_privilege('authenticated','private.fn_imports_commit_drone_photos_impl(uuid)','EXECUTE'),
            'drone_private_service_denied', not has_function_privilege('service_role','private.fn_imports_commit_drone_photos_impl(uuid)','EXECUTE'),
            'admin_helper_present', to_regprocedure('public.is_admin_user()') is not null,
            'active_admin_helper_present', to_regprocedure('private.current_user_is_active_admin()') is not null,
            'profile_rls', (select relrowsecurity from pg_class where oid='public.profiles'::regclass),
            'sighting_commit_present', to_regprocedure('public.commit_sighting_submission(uuid)') is not null
          )::text;
        """,
    ).stdout.strip()
    values = json.loads(checks)
    if not all(values.values()):
        raise HarnessError("fail-closed-postcondition-failed")

    for role in ("anon", "authenticated", "service_role"):
        expect_failure(
            cluster,
            db,
            f"begin; set local role {role}; select * from public.stg_drone_photos; rollback;",
            f"drone-staging-{role}",
        )
        expect_failure(
            cluster,
            db,
            f"begin; set local role {role}; select * from public.stg_biopsies; rollback;",
            f"biopsy-staging-{role}",
        )
        expect_failure(
            cluster,
            db,
            f"begin; set local role {role}; select private.fn_imports_commit_drone_photos_impl('10000000-0000-4000-8000-000000000020'); rollback;",
            f"private-drone-{role}",
        )

    expect_failure(
        cluster,
        db,
        f"""
          begin;
          set local role authenticated;
          select set_config('request.jwt.claim.sub','{USER_ID}',true);
          insert into public.sighting_submissions (id,email,payload)
          values ('10000000-0000-4000-8000-000000000030','user@example.invalid',
            '{{"mantas":[{{"id":"blocked","biopsy":{{"collected":true,"sampleDate":"2026-01-03","collector":"Synthetic","method":"synthetic","tissueType":"synthetic"}}}}]}}');
          rollback;
        """,
        "organic-biopsy-disabled",
    )

    # The ordinary no-biopsy sighting path remains usable by an active profile.
    cluster.psql(
        db,
        sql=f"""
          begin;
          set local role authenticated;
          select set_config('request.jwt.claim.sub','{USER_ID}',true);
          insert into public.sighting_submissions (id,email,sighting_date,payload)
          values ('10000000-0000-4000-8000-000000000031','user@example.invalid',date '2026-01-04',
            '{{"island":"Synthetic Island","sitelocation":"Synthetic Site","mantas":[]}}');
          select public.commit_sighting_submission('10000000-0000-4000-8000-000000000031');
          rollback;
        """,
    )


def test_success(cluster: Cluster) -> dict[str, dict[str, object]]:
    db = "rollback_success"
    cluster.create_db(db)
    prepare_candidate(cluster, db)
    seed_candidate(cluster, db)
    before = snapshot(cluster, db)
    cluster.psql(db, file=ROLLBACK)
    after = snapshot(cluster, db)
    assert_equal(after, before, "rollback-mutated-data")
    verify_fail_closed(cluster, db)
    return before


def test_fingerprint_atomicity(cluster: Cluster) -> None:
    db = "rollback_fingerprint"
    cluster.create_db(db)
    prepare_candidate(cluster, db)
    seed_candidate(cluster, db)
    cluster.psql(db, sql="drop trigger trg_validate_manta_biopsy_children on public.mantas;")
    before_data = snapshot(cluster, db)
    before_meta = metadata_state(cluster, db)
    result = cluster.psql(db, file=ROLLBACK, check=False)
    if result.returncode == 0:
        raise HarnessError("fingerprint-mismatch-was-accepted")
    assert_equal(snapshot(cluster, db), before_data, "fingerprint-failure-mutated-data")
    assert_equal(metadata_state(cluster, db), before_meta, "fingerprint-failure-made-partial-change")


def test_interruption_atomicity(cluster: Cluster) -> None:
    db = "rollback_interruption"
    cluster.create_db(db)
    prepare_candidate(cluster, db)
    seed_candidate(cluster, db)
    before_data = snapshot(cluster, db)
    before_meta = metadata_state(cluster, db)

    source = ROLLBACK.read_text()
    marker = "do $postcondition$"
    if source.count(marker) != 1:
        raise HarnessError("interruption-marker-mismatch")
    interrupted = cluster.tmp / "interrupted_rollback.sql"
    interrupted.write_text(source.replace(marker, "select pg_sleep(30);\n\n" + marker, 1))
    args = [
        executable("psql"), "-X", "-q", "-v", "ON_ERROR_STOP=1",
        "-h", str(cluster.tmp), "-p", str(cluster.port), "-d", db, "-f", str(interrupted),
    ]
    process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    if process.poll() is not None:
        raise HarnessError("interruption-test-did-not-reach-transaction")
    process.terminate()
    process.wait(timeout=10)
    time.sleep(0.2)
    assert_equal(snapshot(cluster, db), before_data, "interruption-mutated-data")
    assert_equal(metadata_state(cluster, db), before_meta, "interruption-left-partial-schema")


def main() -> int:
    cluster = Cluster()
    try:
        cluster.start()
        preserved = test_success(cluster)
        print("PASS complete-forward-sequence-and-combined-rollback")
        print("PASS data-preservation " + json.dumps(preserved, sort_keys=True, separators=(",", ":")))
        print("PASS fail-closed-organic-biopsy-and-drone-import")
        print("PASS legacy-biopsy-importer-absent")
        print("PASS anonymous-user-service-private-bypasses-denied")
        test_fingerprint_atomicity(cluster)
        print("PASS fingerprint-mismatch-atomicity")
        test_interruption_atomicity(cluster)
        print("PASS interruption-transaction-rollback")
        return 0
    except (HarnessError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        print(f"FAIL {type(exc).__name__}:{exc}")
        return 1
    finally:
        cluster.stop()


if __name__ == "__main__":
    raise SystemExit(main())
