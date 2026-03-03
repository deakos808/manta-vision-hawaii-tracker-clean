set -euo pipefail

echo "PREFLIGHT: routes present in src/App.tsx"
rg -n 'path="/browse/' src/App.tsx >/dev/null

for r in /browse/data /browse/catalog /browse/sightings /browse/mantas /browse/photos /browse/sizes /browse/biopsies /browse/drone
do
  rg -n "path=\"${r}\"" src/App.tsx >/dev/null
done

echo "PREFLIGHT: no backups added/modified in staged changes"
if git diff --cached --name-status | rg -n '^(A|M|R[0-9]+)\s+backups/' >/dev/null; then
  echo "ERROR: backups/ paths are added/modified/renamed in staged changes"
  git diff --cached --name-status | rg -n '^(A|M|R[0-9]+)\s+backups/'
  exit 1
fi

echo "PREFLIGHT: no JWT-like strings in tracked source"
if rg -n 'eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}' -S src scripts release >/dev/null; then
  echo "ERROR: JWT-like token found in src/scripts/release"
  rg -n 'eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}' -S src scripts release
  exit 1
fi

echo "PREFLIGHT OK"
