#!/usr/bin/env bash
# topic.pr : ouvre la PR GitHub de la branche du sujet. cwd = worktree du sujet.
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

require_env AID_BRANCH AID_BASE AID_PR_TITLE
AID_PR_BODY="${AID_PR_BODY:-}" # description facultative : vide est une valeur valide
GH="${AID_GH_BIN:-gh}"

"$GH" auth status >/dev/null 2>&1 || die_human "gh non authentifié : lancer « gh auth login »"

"$GH" pr create --title "$AID_PR_TITLE" --body "$AID_PR_BODY" --base "$AID_BASE" \
  --head "$AID_BRANCH" >/dev/null

printf '::aid:: %s\n' "$("$GH" pr view "$AID_BRANCH" --json number,url)"
