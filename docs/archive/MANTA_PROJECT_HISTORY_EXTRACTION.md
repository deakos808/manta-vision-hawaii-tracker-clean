# Manta Project History Extraction

## Verified Facts

Fresh task root should be:

`/Users/littlemac/dev/GitHub/manta-vision-hawaii-tracker-clean`

Canonical remote:

`https://github.com/deakos808/manta-vision-hawaii-tracker-clean.git`

Active branch used for the checkpoint work:

`codex/manta-next-improvements`

The repo was clean at the final identity check. The branch was tracking:

`origin/codex/manta-next-improvements`

The project was classified as:

**NEW / ACTIVE / SAFE**

Recent verified commit stack included:

```text
984a8773 chore: preserve historical Kona age-ranking comparison
00e8e842 feat: add research workbench and biopsy age ranking tools
b62b66c4 feat: expand QC checks and size cleanup tools
7696da7a feat: add manta size catalog link migration
205c0623 feat: improve browse data size and biopsy views
c6bd6b89 chore: ignore local reports and scratch SQL
2838a35c chore: add Kona age ranking analysis scripts
d3e047f5 docs: add manta automatcher technical brief
```

## Implemented / Committed Work

`c6bd6b89`:
Ignored generated/local output noise:

```text
reports/
tmp_*.sql
```

`205c0623`:
Improved browse data size and biopsy views. Included:

- `src/utils/sizeMeasurements.ts`
- Catalog evidence toggles/counts
- Mantas/Sizes child size/biopsy views
- size measurement display helpers
- photo filename/thumb display improvements
- modal loading fixes

`7696da7a`:
Added migration file only:

```text
supabase/migrations/20260703_070800_manta_sizes_fk_catalog_id.sql
```

Migration adds `manta_sizes.fk_catalog_id`, backfills from `mantas.fk_catalog_id`, adds index/FK/triggers.

`b62b66c4`:
Expanded QC checks and size cleanup tools. Included:

- `package.json` QC commands
- enhanced biopsy/photo/size QC checks
- size cleanup/import scripts
- Data Quality Control page repair/review additions

`00e8e842`:
Added research workbench and biopsy age ranking tools. Included:

- admin research routes
- research dashboard/pages
- biopsy age ranking library
- analysis scripts

`984a8773`:
Preserved historical Kona age-ranking comparison.

## Validation Performed

Builds were run after the feature bucket commits and final push validation:

```text
npm run build
```

Build passed. It repeatedly stamped `generated/version.ts`; each time, only `generated/version.ts` was restored to HEAD.

Python syntax validation was run for analysis Python files:

```text
python3 -m py_compile scripts/analysis/*.py
```

It passed.

The branch was pushed to:

```text
origin/codex/manta-next-improvements
```

## Production / Data Risk Notes

No migrations were run.

No deploys were run.

No production data operations were intentionally run.

Important production-risk items:

- `supabase/migrations/20260703_070800_manta_sizes_fk_catalog_id.sql` is committed but not applied during this task. Applying it will:
  - alter `public.manta_sizes`
  - backfill `fk_catalog_id`
  - validate an FK to `catalog`
  - create sync triggers
  - potentially lock/update existing rows

- QC scripts added in Bucket B are read-only by default but can write when run with `--apply`:
  - `scripts/qc/import_size_pixels_from_export.ts`
  - `scripts/qc/dedupe_legacy_size_imports.ts`
  - `scripts/qc/import_mprf_website_first_sightings.ts`

- New `package.json` QC commands do **not** include `--apply` by default.

- `DataQualityControlPage.tsx` contains admin repair/delete actions. Most destructive actions require prompt/confirm and audit logging. One lower-risk repair action, photo sighting-link repair, uses a generated audit reason rather than a user-entered reason.

## Generated / Local Output Handling

These are ignored now:

```text
reports/
tmp_*.sql
```

Already ignored before the hygiene change:

```text
generated/version.ts
supabase/.temp/
```

A preservation snapshot was saved outside the repo at:

```text
/Users/littlemac/Desktop/manta-dirty-preservation/20260710_201755/
```

It included status, diff stat, name-only diff, full tracked diff, untracked list, branch/remote info, and the change-group summary from the checkpoint.

## Useful Decisions

Commit buckets were separated deliberately:

1. Hygiene ignore patterns
2. Browse/admin UI + shared size utilities
3. Database migration file only
4. QC checker/scripts/admin QC UI
5. Research workbench + analysis scripts

Reason for ordering:

- Shared size utilities needed before QC/UI dependencies.
- Migration committed before QC commit because Bucket B checks/repairs depend on `manta_sizes.fk_catalog_id`.
- Research workbench was isolated from QC and migration work.

## Unresolved / Follow-Up Items

- Migration is committed but not applied. It needs deliberate review/application in the proper environment.
- No PR was opened in this thread.
- Browser/runtime UI testing was not performed beyond `npm run build`.
- Analysis scripts were not executed.
- QC scripts were not run with `--apply`.
- Existing build warnings remain:
  - stale Browserslist/caniuse data warning
  - large Vite chunk warning
  - Leaflet dynamic/static import chunking warning

## Stale Assumptions / Not Reverified Here

These were true at the time of prior checks but should be rechecked in a fresh task:

- Branch still clean.
- Branch still tracking `origin/codex/manta-next-improvements`.
- Remote still unchanged.
- Latest commit still `984a8773`.
- No new local dirty files appeared after the last identity audit.
- No one else pushed additional changes to the remote branch after the final push/identity checks.
