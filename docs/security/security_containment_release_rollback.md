# Security containment release rollback

## Canonical artifact

For the complete security-containment candidate after these four migrations:

1. `20260816124142_user_access_management.sql`
2. `20261001064839_import_authorization_containment.sql`
3. `20261001150410_organic_biopsy_entry_and_legacy_retirement.sql`
4. `20261001153752_harden_organic_biopsy_integrity.sql`

the only release-level database rollback is:

`supabase/rollback/20261001162000_security_containment_combined_fail_closed_rollback.sql`

Run it as one transaction with `ON_ERROR_STOP` enabled. It fingerprints the
complete post-migration schema before changing anything and verifies the
fail-closed result before commit.

## Fail-closed result

The canonical rollback:

- disables organic biopsy submission while retaining the ordinary no-biopsy
  sighting commit and all parent/child integrity guards;
- removes the public drone-import wrapper and revokes direct execution of its
  retained private implementation;
- keeps the legacy biopsy CSV importer absent;
- revokes browser, API, service-role, and direct access to both import staging
  surfaces;
- preserves the active-profile and active-admin authorization helpers, profile
  RLS, user-access audit controls, and one-active-admin protection; and
- performs no row deletion, truncation, table drop, destructive column change,
  or record update.

All application, Auth, staging, destination, and audit rows remain intact. The
rollback is a safety stop, not a restoration of the insecure legacy behavior.

## Superseded component rollback

`supabase/rollback/20261001064839_import_authorization_containment_rollback.sql`
is superseded for release rollback of the complete candidate. Its opening
fingerprint expects both import wrappers, but the later organic-biopsy migration
permanently retires the biopsy importer. Operators must not select that older
artifact after all four forward migrations.

The older component rollback files remain in Git as historical evidence and
focused migration-test fixtures. They are not alternatives to the canonical
release-level artifact and must not be chained to construct a release rollback.

## Verification

Run:

```sh
python3 scripts/security/test_combined_release_rollback.py
```

The test creates disposable local PostgreSQL databases, applies the four
forward migrations in order, records deterministic counts and hashes for
fabricated rows and their relationships, applies the canonical rollback, and
requires exact equality afterward. Separate databases prove that a fingerprint
mismatch and a client interruption leave no partial schema change. The test
also verifies that organic-biopsy and drone-import writes fail closed, the
retired biopsy importer remains absent, direct/private bypasses are denied, and
the ordinary no-biopsy sighting path remains available to an active profile.
