#!/usr/bin/env python3
"""Verify the bounded biopsy primary-key sequence reconciliation locally."""

from __future__ import annotations

import json
import subprocess

from test_combined_release_rollback import BASELINE, MIGRATIONS, Cluster, HarnessError, ROOT


MIGRATION = (
    ROOT
    / "supabase/migrations/20261003165701_reconcile_biopsies_primary_key_sequence.sql"
)
ROLLBACK = (
    ROOT
    / "supabase/rollback/20261003165701_reconcile_biopsies_primary_key_sequence_rollback.sql"
)


def prepare_precondition(cluster: Cluster, db: str) -> None:
    cluster.psql(db, file=BASELINE)
    for migration in MIGRATIONS:
        cluster.psql(db, file=migration)
    cluster.psql(
        db,
        sql="""
          alter table public.biopsies alter column pk_biopsy_id drop identity;
          alter table public.biopsies owner to postgres;
          create sequence public.biopsies_pk_biopsy_id_seq
            as bigint increment by 1 minvalue 1 maxvalue 9223372036854775807
            start with 1 cache 1 no cycle;
          alter sequence public.biopsies_pk_biopsy_id_seq owner to postgres;
          alter sequence public.biopsies_pk_biopsy_id_seq
            owned by public.biopsies.pk_biopsy_id;
          alter table public.biopsies alter column pk_biopsy_id
            set default nextval('public.biopsies_pk_biopsy_id_seq'::regclass);
          grant select on sequence public.biopsies_pk_biopsy_id_seq
            to anon, authenticated;
          grant select, update, usage on sequence
            public.biopsies_pk_biopsy_id_seq to service_role;
          insert into public.biopsies (
            pk_biopsy_id, fk_manta_id, fk_sighting_id, fk_catalog_id,
            sample_date, sample_time, collector, method, island, region,
            location, tissue_type, lab_id, notes, source, raw_sample_id,
            created_at, updated_at
          )
          select
            1062, fk_manta_id, fk_sighting_id, fk_catalog_id,
            sample_date, sample_time, collector, method, island, region,
            location, tissue_type, lab_id, notes, 'synthetic-sequence-test',
            'SYNTHETIC-1062', created_at, updated_at
          from public.biopsies
          where pk_biopsy_id = -1;
          select setval('public.biopsies_pk_biopsy_id_seq', 1, true);
        """,
    )


def state(cluster: Cluster, db: str) -> dict[str, object]:
    raw = cluster.psql(
        db,
        sql="""
          select jsonb_build_object(
            'row_count', (select count(*) from public.biopsies),
            'row_hash', (select md5(string_agg(md5(to_jsonb(b)::text), ''
                              order by b.pk_biopsy_id)) from public.biopsies b),
            'table_max', (select max(pk_biopsy_id) from public.biopsies),
            'last_value', q.last_value,
            'is_called', q.is_called
          )::text
          from public.biopsies_pk_biopsy_id_seq q;
        """,
    ).stdout.strip()
    return json.loads(raw)


def expect_denied(cluster: Cluster, db: str, sql: str, category: str) -> None:
    if cluster.psql(db, sql=sql, check=False).returncode == 0:
        raise HarnessError(f"expected-denial-missing:{category}")


def main() -> int:
    cluster = Cluster()
    try:
        cluster.start()

        db = "biopsy_sequence_success"
        cluster.create_db(db)
        prepare_precondition(cluster, db)
        before = state(cluster, db)
        cluster.psql(db, file=MIGRATION)
        after = state(cluster, db)
        if before["row_count"] != after["row_count"] or before["row_hash"] != after["row_hash"]:
            raise HarnessError("sequence-migration-mutated-biopsy-data")
        if after["table_max"] != 1062 or after["last_value"] != 1063 or after["is_called"]:
            raise HarnessError("sequence-migration-postcondition-failed")

        # ALTER SEQUENCE RESTART is transactional. This proves the next value is
        # unused without consuming it after this transaction rolls back.
        probed = cluster.psql(
            db,
            sql="""
              begin;
              alter sequence public.biopsies_pk_biopsy_id_seq restart with 1063;
              select jsonb_build_object(
                'next_value', nextval('public.biopsies_pk_biopsy_id_seq'),
                'collides', exists (
                  select 1 from public.biopsies where pk_biopsy_id = 1063
                )
              )::text;
              rollback;
            """,
        ).stdout.strip()
        if json.loads(probed) != {"next_value": 1063, "collides": False}:
            raise HarnessError("rollback-only-next-value-probe-failed")
        if state(cluster, db) != after:
            raise HarnessError("rollback-only-probe-consumed-sequence-value")
        print("PASS biopsy-sequence-forward-reconciliation")
        print("PASS biopsy-rows-and-content-hash-unchanged")
        print("PASS rollback-only-next-value-unused-and-unconsumed")

        mismatch_db = "biopsy_sequence_mismatch"
        cluster.create_db(mismatch_db)
        prepare_precondition(cluster, mismatch_db)
        cluster.psql(
            mismatch_db,
            sql="alter sequence public.biopsies_pk_biopsy_id_seq increment by 2;",
        )
        mismatch_before = state(cluster, mismatch_db)
        result = cluster.psql(mismatch_db, file=MIGRATION, check=False)
        if result.returncode == 0:
            raise HarnessError("sequence-fingerprint-mismatch-was-accepted")
        if state(cluster, mismatch_db) != mismatch_before:
            raise HarnessError("sequence-fingerprint-failure-made-partial-change")
        print("PASS biopsy-sequence-fingerprint-atomicity")

        rollback_db = "biopsy_sequence_rollback"
        cluster.create_db(rollback_db)
        prepare_precondition(cluster, rollback_db)
        cluster.psql(rollback_db, file=MIGRATION)
        rollback_before = state(cluster, rollback_db)
        cluster.psql(rollback_db, file=ROLLBACK)
        if state(cluster, rollback_db) != rollback_before:
            raise HarnessError("sequence-fail-closed-rollback-mutated-data-or-sequence")
        for role in ("anon", "authenticated", "service_role"):
            for function in (
                "public.commit_sighting_submission(uuid)",
                "public.commit_sighting_submission_with_biopsies(uuid)",
            ):
                allowed = cluster.psql(
                    rollback_db,
                    sql=f"select has_function_privilege('{role}','{function}','EXECUTE');",
                ).stdout.strip()
                if allowed != "f":
                    raise HarnessError(f"fail-closed-rollback-execute-remains:{role}:{function}")
        print("PASS biopsy-sequence-fail-closed-rollback")
        return 0
    except (HarnessError, subprocess.TimeoutExpired, json.JSONDecodeError) as exc:
        print(f"FAIL {type(exc).__name__}:{exc}")
        return 1
    finally:
        cluster.stop()


if __name__ == "__main__":
    raise SystemExit(main())
