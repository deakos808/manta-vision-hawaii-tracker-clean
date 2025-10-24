#!/usr/bin/env sh
set -e

# ensure .gitignore rules (idempotent)
grep -qx 'backups/*.tar.gz' .gitignore 2>/dev/null || printf "backups/*.tar.gz\n" >> .gitignore
grep -qx 'scripts/_backups/' .gitignore 2>/dev/null || printf "scripts/_backups/\n" >> .gitignore

# untrack any archives that were accidentally committed earlier
git rm --cached backups/*.tar.gz 2>/dev/null || true

# stage everything else and commit (empty commit if no changes)
git add -A
TS=$(date -u +%Y%m%dT%H%M%SZ)
TAG="working-map-modal-$TS"
if git diff --cached --quiet; then
  git commit --allow-empty -m "backup(tag-only): $TAG"
else
  git commit -m "backup: $TAG"
fi

# create a timestamped tag and push branch + tag
git tag -a "$TAG" -m "$TAG"
BR=$(git rev-parse --abbrev-ref HEAD)
git push origin "$BR"
git push origin "$TAG"

echo "OK: tag $TAG pushed. Archives remain local only."
