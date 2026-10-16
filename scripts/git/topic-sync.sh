#!/usr/bin/env bash
# topic.sync : avance la branche sur origin/<base> par rebase. cwd = worktree du sujet.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_env AID_REPO_ROOT AID_BRANCH AID_BASE AID_WORKTREE
export GIT_EDITOR=true # rebase --continue ne doit jamais attendre un éditeur interactif

conflict_exit() {
  local files
  files="$(git diff --name-only --diff-filter=U)"
  printf '::aid:: %s\n' "$(FILES="$files" node -e '
    const files = (process.env.FILES || "").split("\n").filter(Boolean);
    process.stdout.write(JSON.stringify({ conflict: true, files }));
  ')"
  exit 2
}

if [ "${AID_SYNC_ABORT:-}" = "1" ]; then
  git rebase --abort
  printf '::aid:: {"aborted": true}\n'
  exit 0
fi

if [ "${AID_SYNC_CONTINUE:-}" = "1" ]; then
  git add -A
  git rebase --continue || conflict_exit
  printf '::aid:: {"synced": true}\n'
  exit 0
fi

git fetch --quiet origin "$AID_BASE"
git rebase "origin/$AID_BASE" || conflict_exit

printf '::aid:: {"synced": true}\n'
