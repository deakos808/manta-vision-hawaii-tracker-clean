# Manta Codex Project Context

This file is the operational starting point for future Codex work on the Manta Ray App. It records the canonical repository identity, recovered project history, known stale contexts, and safety rules. Re-verify the live repository state at the start of every task; do not assume this document freezes Git or database state.

## Canonical project identity

- Project: Manta Ray App / Hawaii Manta Tracker
- Canonical local repository: `/Users/littlemac/dev/GitHub/manta-vision-hawaii-tracker-clean`
- Canonical remote: `https://github.com/deakos808/manta-vision-hawaii-tracker-clean.git`
- Protected active branch: `codex/manta-next-improvements`
- Saved Codex project: `Manta Ray App`, mapped to the canonical local repository

The canonical branch should include the recovered checkpoint stack, including `984a8773 chore: preserve historical Kona age-ranking comparison`. A commit hash recorded here is a historical checkpoint, not a substitute for checking the current branch and log.

## Desktop launcher

The active launcher is:

`/Users/littlemac/Desktop/Codex APPs/mantatracker.app`

It is a zsh launcher bundle that:

- changes into the canonical repository;
- starts the Vite frontend on `127.0.0.1:8080` with `npm run dev -- --host 127.0.0.1 --port 8080` when port 8080 is not already listening;
- starts the local matcher API with `npm run dev:matcher-api` when matcher port 8766 is not already listening; and
- opens `http://127.0.0.1:8080/` after the frontend becomes available.

The launcher at `/Users/littlemac/Desktop/mantatracker.app` was not present during the alignment audit. Never replace or modify the active launcher without a separate launcher-specific approval and path verification.

## Old paths and workspaces to avoid

Do not use these locations for new coding:

- `/workspace/hawaii-manta-tracker` — missing during the audit; any task referencing it is a broken or stale cloud/workspace context.
- `/Users/littlemac/Documents/New project 2` — old working folder with no commits or remote. Its unique May 29 Kona work has been preserved in the canonical repository, but the folder must not be modified or deleted without separate approval.
- `/Users/littlemac/dev/GitHub/old hawaii-manta-tracker` — clean legacy repository with the separate `deakos808/hawaii-manta-tracker.git` remote.
- `/Users/littlemac/dev/GitHub/old manta-ray-spotter` — clean legacy repository with the separate `deakos808/manta-ray-spotter.git` remote. It contains many paths not present in the canonical repo and needs a provenance review before archival.

Prompts inside an old task may name the canonical repository while the task's actual working directory remains stale. The task working directory must be verified independently.

## Codex project and task classifications

### Safe for future coding

- `Manta Ray App` saved project — canonical local project mapping.
- `Inspect dirty repo changes` — verified against the canonical path, remote, protected branch, clean state, and recovered commit stack.

Even safe tasks must run the startup verification below before editing. The preferred approach for new feature work is a fresh task created under the saved `Manta Ray App` project.

### Safe but old task

- `Kona Age Ranking Analysis` — extensive research history, model assumptions, PI_HAT/PCSU reconciliation, special-review IDs, and generated workbook/report decisions. Extract context before reuse; perform new coding in a fresh canonical task.
- `Fix size QC errors` — size cleanup findings and record-level QC decisions. Treat as reference because the underlying data and branch may have changed.

### Correct repository but obsolete branch assumptions

- `Create smoke test checklist` — targets `codex/manta-recovery-checkpoint`, not the protected active branch.
- `Start recovery session` — expects `main`, not the protected active branch.

Keep these as reference only. Do not resume coding from their branch assumptions.

### Old or broken working-directory tasks

The following tasks were associated with `/Users/littlemac/Documents/New project 2` even when their prompts referred to the canonical repository:

- `Review Kona age ranking` — meeting-ready Kona analysis, assumptions, results, caveats, and later memory-hygiene audit context.
- `Continue QC data cleanup` — sightings/mantas/photos QC, audit logging, and the missing `data_change_audit` migration context. It contains production-sensitive history.
- `Add data quality control` — QC dashboard architecture, table/link integrity checks, and export/storage drift findings.
- `Photo Edit Add New Sighting` — Add Sighting staging, admin review, photo editor, matching/new-manta decisions, and canonical commit workflow.
- `Automated Manta Matching` — deterministic local matcher experiments, design constraints, failed approaches, diagnostics, and performance work.
- `Add Matcher to New Sighting` — integration of local matcher results into the ventral-photo and catalog-selection workflow.

Extract useful history from these tasks, then keep or archive them as reference. Never code from their stale working directory.

### Unknown tasks requiring manual verification

Tasks or projects named `hawaii-manta-tracker`, `Build match-photo Edge Function`, `Find and fix a bug in codebase`, `Find and fix typo in codebase`, and `Explain codebase structure` were not positively mapped in the recent accessible task inventory. Manually open each task and verify its host, working directory, Git top-level, branch, remote, and status. Any task rooted at `/workspace/hawaii-manta-tracker` is a cloud/workspace copy or broken stale context and must not be used for coding.

## Major recovered work

### Add Sighting, photo editor, and review workflow

Recovered work covers the in-water Add Sighting flow from form submission through the `sighting_submissions` staging record, admin review, photo editing and ventral-best-photo selection, match-versus-new decisions, final commit into canonical sightings/mantas/photos/catalog records, and recent-submission display. Preserve the staged-review boundary and do not bypass audited commit behavior.

### QC dashboard and data-quality tools

The recovered QC system covers Catalog, Sightings, Mantas, Photos, Sizes, Biopsies, storage/export consistency, missing links, duplicate review, and related admin tools. Important historical findings include drift between export manifests, local cached files, storage paths, and database records. QC findings must be reviewed before any correction is applied to production data.

### Size QC and manta_sizes migration

Recovered work includes size error/warning cleanup, catalog-link corrections, size display improvements, deduplication/import tools, and the `manta_sizes` foreign-key/catalog-link migration work. Migration existence in the repo does not imply it is safe or necessary to run again. Verify deployed schema and migration history before proposing any database action.

### Research workbench and biopsy age-ranking tools

The canonical app includes research dashboard/workbench pages, biopsy age-ranking views, age/growth exploration, and supporting research libraries and scripts. These tools expose configurable assumptions and derived rankings; results should be treated as evidence-based relative rankings rather than definitive absolute ages.

### Local matcher and matching-performance tools

Recovered work includes a deterministic local matcher, matcher API, admin test interface, performance and QC scripts, diagnostic artifacts, and integration concepts for Add Sighting. The desktop launcher starts the matcher API on port 8766. Matcher caches and diagnostic outputs are local/generated material unless a task explicitly approves preserving a specific artifact.

### Kona age-ranking scripts

The canonical repository contains the recovered Kona Model 1, Model 2, Model 3, database-backed ranking, sensitivity, PI_HAT/PCSU alignment, and report-generation scripts under `scripts/analysis/`. Model assumptions, sample alignment, and unresolved or special-review identities must remain explicit in any interpretation.

### Historical May 29 Kona comparison

The unique May 29, 2026 Model 1/2/3 comparison was preserved in commit `984a8773`. Historical source logic is under `scripts/analysis/historical/`, and the archived CSV/DOCX/PDF plus provenance README are under `docs/research/kona-age-ranking/historical-2026-05-29/`. The historical CSV intentionally retains its original CRLF formatting and hash. It is related to, but not identical to, the newer July canonical analysis.

## Database and Supabase safety

- Never run a migration casually or merely because a migration file exists locally.
- Inspect the current schema, migration history, target project, and intended effect before proposing a migration.
- Production data edits require explicit user approval for the specific records and operation.
- Prefer read-only inspection and dry-run/report modes.
- QC scripts with an `--apply` mode must not use `--apply` by default. Treat apply mode as a production-data mutation requiring explicit approval.
- Do not paste or run SQL against Supabase merely to resolve an application error without first confirming the target project, schema, audit requirements, and rollback/recovery plan.
- Never expose `.env` values, service-role keys, database URLs, tokens, or other credentials in task output.

## Local and generated files to avoid committing

Unless a task explicitly approves a specific artifact, do not stage or commit:

- `generated/version.ts` when modified only by a build or commit hook;
- `reports/` generated reports and workbooks;
- `tmp_*.sql` scratch SQL files;
- `supabase/.temp/` CLI state;
- matcher caches, signatures, debug images, performance results, and generated matcher output directories;
- local environment files, caches, logs, database dumps, build artifacts, and dependency directories.

Before every commit, inspect both tracked changes and untracked files. Stage explicit paths only. If a build or commit hook modifies only `generated/version.ts`, restore that generated change to `HEAD` when the approved task instructs it.

## Mandatory startup verification

Every future Manta task must begin with read-only identity checks before editing or running project commands:

```bash
pwd
git rev-parse --show-toplevel
git branch --show-current
git branch -vv
git remote -v
git status --short
```

Proceed only when:

1. `pwd` and Git top-level are `/Users/littlemac/dev/GitHub/manta-vision-hawaii-tracker-clean`;
2. the active branch is `codex/manta-next-improvements`, unless the user explicitly authorizes another branch;
3. `origin` is `https://github.com/deakos808/manta-vision-hawaii-tracker-clean.git`; and
4. the working-tree state is understood and compatible with the requested task.

If any check differs, stop and report the discrepancy before editing.

## Recommended next steps

1. Extract concise history summaries from the old Kona, QC, Add Sighting, and matcher reference tasks without running commands in those tasks.
2. Manually verify unknown `hawaii-manta-tracker` and other possibly cloud/workspace tasks. Do not code in `/workspace/hawaii-manta-tracker`.
3. Perform a dedicated provenance review of `/Users/littlemac/dev/GitHub/old manta-ray-spotter`, especially its tracked paths absent from the canonical repo, before considering archival.
4. Keep `/Users/littlemac/Documents/New project 2` unchanged until the historical preservation commit and artifact hashes are considered independently verified.
5. Use a fresh task under the canonical `Manta Ray App` saved project for the next coding objective.
