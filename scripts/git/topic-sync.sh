#!/usr/bin/env bash
# topic.sync : avance la branche sur origin/<base> par rebase. cwd = worktree du sujet.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_env AID_REPO_ROOT AID_BRANCH AID_BASE AID_WORKTREE

git fetch --quiet origin "$AID_BASE"
git rebase "origin/$AID_BASE"

printf '::aid:: {"synced": true}\n'
