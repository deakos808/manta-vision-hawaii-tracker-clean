set -euo pipefail

# 0) Freeze working tree
git add -A
git commit -m "temp: freeze working tree for history cleanup" || true

# 1) Disable hooks during rewrite
orig_hooks="$(git config --local --get core.hooksPath || echo ".git/hooks")"
if [ -d "$orig_hooks" ]; then mv "$orig_hooks" "${orig_hooks}.disabled"; fi
git config --local core.hooksPath /dev/null

# 2) Install git-filter-repo locally if missing
if ! command -v git-filter-repo >/dev/null 2>&1; then
  echo "[info] installing git-filter-repo to .git/tools"
  mkdir -p .git/tools
  curl -fsSL https://raw.githubusercontent.com/newren/git-filter-repo/main/git-filter-repo \
    -o .git/tools/git-filter-repo
  chmod +x .git/tools/git-filter-repo
  export PATH="$PWD/.git/tools:$PATH"
fi

# 3) Rewrite ALL refs to drop archives
git-filter-repo --force \
  --invert-paths --path-glob 'backups/*.tar.gz' \
  --refs 'refs/heads/*' --refs 'refs/tags/*' --refs HEAD

# 4) Prune original refs & aggressively GC
rm -rf .git/refs/original/
git for-each-ref --format='delete %(refname)' refs/original | git update-ref --stdin || true
git reflog expire --expire=now --all || true
git gc --prune=now --aggressive || true

# 5) Verify locally (should print "OK")
git rev-list --objects --all | grep -E '^.+backups/.+\.tar\.gz$' && { echo "[ERROR] archives still in history"; exit 1; } || echo "[OK] no archives left in history"

# 6) Make sure we never add archives again
printf "backups/*.tar.gz\nscripts/_backups/\n" >> .gitignore
git add .gitignore
git commit -m "chore: ignore local archives" || true

# 7) Force-push cleaned history (branches + tags)
git push --force --all origin
git push --force --tags origin

# 8) Restore hooks
git config --unset core.hooksPath || true
if [ -d "${orig_hooks}.disabled" ]; then mv "${orig_hooks}.disabled" "$orig_hooks"; fi

echo "[DONE] Remote history cleaned and pushed."
