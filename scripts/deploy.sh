#!/usr/bin/env bash
set -euo pipefail
scripts/backup_tag.sh
git push origin "$(git rev-parse --abbrev-ref HEAD)"
