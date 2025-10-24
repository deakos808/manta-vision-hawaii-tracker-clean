#!/usr/bin/env bash
set -euo pipefail

ts=$(date -u +'%Y%m%dT%H%M%SZ')
tag="working-${ts}"

git add -A
if ! git diff --cached --quiet; then
  git commit -m "backup: ${tag}"
fi

mkdir -p backups
git archive --format=tar.gz -o "backups/${tag}.tar.gz" HEAD

git tag -f "${tag}"
git push origin HEAD
git push --force origin "${tag}"
