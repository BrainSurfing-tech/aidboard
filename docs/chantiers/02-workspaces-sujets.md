# 02 — Workspaces, sujets et worktrees

## Pourquoi

Un sujet est une branche et un worktree (§1). Le daemon doit les créer et les supprimer
sans jamais perdre de travail, sans laisser l'agent ou le titre d'un sujet atteindre un
shell, et en déclarant l'absence d'index au lieu de la taire (§5).

## État actuel

Chantier 01 livré : `EventStore.append(e, mutate)` (`src/daemon/events/store.ts`), tables
`workspaces`, `topics`, `runs`, `actions`, sécurité, `/ws/events` qui accepte des messages
`{ kind: 'ephemeral' }`.

## Cible

- `POST /api/workspaces` : enregistrer un repo local.
- Exécuteur de scripts bash conforme au contrat du §5, file d'exécution par workspace.
- `POST /api/topics` (`topic.create`) avec indexation conditionnelle (D6).
- `POST /api/topics/:id/actions/topic.cleanup` avec les garde-fous D7.
- `POST /api/topics/:id/actions/editor.open`.

Hors périmètre : `topic.sync`, `topic.pr`, `topic.merge` (v0.3), registre d'actions
configurable (v0.3), sujet depuis une issue.

## Décisions prises

- **Actions v0.1** : table fixe dans `src/daemon/actions/registry.ts` —
  `topic.create`, `topic.cleanup`, `editor.open`. Rien de configurable.
- **Slug** : `slugify(title)` = NFD, suppression des diacritiques, minuscules, toute suite
  hors `[a-z0-9]` → `-`, tirets de bord retirés, tronqué à 48. Validé par
  `^[a-z0-9][a-z0-9-]{0,47}$` ; un slug fourni par le client est validé de la même façon,
  jamais transformé en silence. Branche `<type>/<slug>`.
- **Le sujet n'existe en base qu'après la réussite du script** : `action.started`
  (`workspaceId`, `data: { action: 'topic.create', slug, branch }`) → script → en cas de
  succès, un seul `append` de `topic.state { state: 'active' }` dont le `mutate` insère le
  topic et son run `standard` implicite → `action.finished { topicId }`. Un échec laisse
  le slug libre pour une nouvelle tentative.
- **Un run implicite par sujet** : créé avec le sujet, `mode: 'standard'`,
  `state: 'open'`. `POST /api/runs` n'existe pas encore (l'UI v0.1 n'ouvre pas de run).
- **Environnement des scripts** : `process.env` moins `config.env.strip`, plus les `AID_*`
  du §5, plus `GIT_TERMINAL_PROMPT=0` et
  `GIT_SSH_COMMAND="ssh -o BatchMode=yes"` ; `stdin: 'ignore'`. Un `git fetch` qui voudrait
  un mot de passe échoue au lieu de bloquer indéfiniment.
- **Délais** : `topic.create` 5 min, `topic.cleanup` 2 min, puis `SIGTERM`, `SIGKILL` 5 s
  après ; résultat `failed`, raison `timeout`.
- **Indexation** (D6) : seulement si `<repoRoot>/.codegraph/` existe. Alors
  `codegraph init -y <worktree>` détaché de la file git, délai 15 min. `index_state` :
  `disabled` (pas d'index dans le repo principal) → affiché « index absent : lecture
  directe » ; `indexing` ; `ready` ; `failed` → affiché « index en échec : lecture directe ».
  Le binaire est injecté (`deps.codegraphBin`) pour que les tests utilisent un faux.
  Les changements d'`index_state` passent par un événement `topic.state` dont `data` porte
  `{ state, indexState }` (pas de type neuf).
- **Cleanup** (D7) : refus par le daemon (409) si un agent du sujet est vivant. Le script
  refuse (code 2) si `git status --porcelain` n'est pas vide, puis (code 2) si
  `git rev-list --count origin/<base>..<branche>` > 0, sauf si
  `AID_CONFIRM_UNMERGED=<n>` égale ce compte exact. La confirmation doit répéter le nombre
  affiché : une confirmation périmée (un commit de plus depuis) est refusée.

## Points

### 02.1 — Enregistrer un workspace

Fichiers : `src/daemon/git/inspect.ts`, `src/daemon/routes/workspaces.ts`,
`src/shared/slug.ts`, `test/helpers/git.ts`, `test/workspaces.test.ts`, `test/slug.test.ts`.

```ts
// src/daemon/git/inspect.ts — execFile('git', [...]) uniquement
export async function inspectRepo(path: string): Promise<{
  root: string; baseBranch: string | null; hasOrigin: boolean; isLinkedWorktree: boolean;
  hasCodegraph: boolean }>;
// root = realpath ; refus si `git rev-parse --show-toplevel` ≠ root
// isLinkedWorktree = (--git-dir) ≠ (--git-common-dir)
// baseBranch = `git symbolic-ref --quiet --short refs/remotes/origin/HEAD` sans « origin/ »
```

`POST /api/workspaces` `{ path: string; baseBranch?: string }` :
- 422 si : pas un repo, pas sa racine, worktree lié, pas d'`origin`, base introuvable et
  non fournie (« branche de base introuvable : la préciser »), base fournie mais
  `origin/<base>` absent.
- 409 si `root` déjà enregistré.
- `name` = basename assaini (même règle que le slug) ; collision → suffixe `-2`, `-3`.
- `worktrees_dir` = `<aidHome>/worktrees/<name>`.
- `warnings` : `['repo sous /mnt : performances WSL2 dégradées']` si
  `/proc/version` contient `microsoft` et `root` commence par `/mnt/`.
- Pas d'événement dédié en v0.1 : insertion directe, puis `GET /api/state` la montre.
  (Le type `workspace.*` n'est pas dans la liste du §4 : ne pas en inventer.)

`test/helpers/git.ts` :

```ts
export async function makeOriginAndClone(tmp: string, opts?: { base?: string; codegraph?: boolean }):
  Promise<{ origin: string; clone: string }>;
// bare repo + clone + un commit initial poussé + origin/HEAD posé (git remote set-head origin -a)
```

Tests : chaque cas 422/409 ci-dessus ; détection de `main` et de `master` ; avertissement
`/mnt` (simuler `/proc/version` par injection, pas en le lisant pour de vrai).

Tests `slug` : `"Écran d'accueil v2 !"` → `ecran-d-accueil-v2` ; 60 caractères tronqués à
48 sans tiret final ; `"../../etc"` → `etc` ; chaîne vide → erreur.

### 02.2 — Exécuteur de scripts et file par workspace

Fichiers : `src/daemon/actions/runner.ts`, `src/daemon/actions/queue.ts`,
`test/runner.test.ts`, `test/fixtures/scripts/*.sh`.

```ts
export interface ScriptOutcome { exitCode: number | null; outcome: 'succeeded' | 'needs_human' | 'failed';
  result: Record<string, unknown>; tail: string[] /* 50 dernières lignes */; reason?: 'timeout' | 'spawn' }
export function runScript(o: { script: string; cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number;
  logPath: string; onLine(l: { stream: 'stdout' | 'stderr'; line: string }): void }): Promise<ScriptOutcome>;
// spawn('bash', [script], { cwd, env, stdio: ['ignore','pipe','pipe'] })
// ligne commençant par "::aid:: " → JSON.parse, fusion dans result ; JSON invalide → ligne normale
// code 0 → succeeded, 2 → needs_human, autre / signal → failed

export class WorkspaceQueue { run<T>(workspaceId: string, job: () => Promise<T>): Promise<T> }
// une promesse en chaîne par workspace ; un job qui échoue ne bloque pas les suivants
```

Le service qui orchestre une action (`src/daemon/actions/service.ts`) : `action.started` →
`runScript` (lignes relayées en `{ kind: 'ephemeral', type: 'action.output', actionId,
stream, line }` sur `/ws/events`, et écrites dans `logs/actions/<id>.log`) →
`action.finished { exitCode, outcome, result, tail }`.

Tests : code 0/2/1 ; `::aid::` fusionné ; JSON invalide toléré ; délai dépassé → `failed`
+ `timeout` et process tué ; deux jobs sur le même workspace s'exécutent l'un après
l'autre (horodatages), sur deux workspaces en parallèle ; un job qui lève libère la file.

### 02.3 — `topic.create`

Fichiers : `scripts/git/lib.sh`, `scripts/git/topic-create.sh`,
`src/daemon/routes/topics.ts`, `src/daemon/topics/create.ts`, `src/daemon/topics/index.ts`
(indexation), `test/fixtures/fake-codegraph.sh`, `test/topic-create.test.ts`.

`scripts/git/topic-create.sh` (cwd = racine du repo) :

```bash
#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"          # die_human, die
require_env AID_REPO_ROOT AID_SLUG AID_BRANCH AID_BASE AID_WORKTREE
git fetch --quiet origin "$AID_BASE"
git show-ref --verify --quiet "refs/heads/$AID_BRANCH" && die_human "la branche $AID_BRANCH existe déjà"
[ -e "$AID_WORKTREE" ] && die_human "le chemin $AID_WORKTREE existe déjà"
mkdir -p "$(dirname "$AID_WORKTREE")"
git worktree add --no-track -b "$AID_BRANCH" "$AID_WORKTREE" "origin/$AID_BASE"
if [ -f .worktreeinclude ]; then
  git ls-files --others --ignored --exclude-from=.worktreeinclude -z |
  while IFS= read -r -d '' f; do
    git check-ignore -q -- "$f" || continue      # seulement les fichiers ignorés par git
    mkdir -p "$AID_WORKTREE/$(dirname "$f")"
    cp -p -- "$f" "$AID_WORKTREE/$f"
    echo "copié : $f"
  done
fi
printf '::aid:: {"worktree": "%s"}\n' "$AID_WORKTREE"
```

`lib.sh` : `die_human() { echo "$1" >&2; exit 2; }`, `die() { echo "$1" >&2; exit 1; }`,
`require_env` (sort en 1 si une variable manque).

`POST /api/topics` `{ workspaceId, title, type, slug? }` → 202 `{ actionId, slug, branch }`
(le script tourne en tâche de fond dans la `WorkspaceQueue`) ; 409 si le slug existe déjà en
base pour ce workspace ; 422 slug invalide.

Après succès : `index_state = hasCodegraph ? 'indexing' : 'disabled'`, puis si `indexing` :
`codegraph init -y <worktree>` hors file, et à la fin `topic.state` avec `indexState` à
`ready` ou `failed`.

Tests (vrais repos via `makeOriginAndClone`) :
- crée branche + worktree sous `<AID_HOME>/worktrees/<ws>/<slug>`, base = `origin/main` ;
- la branche n'a **pas** d'amont (`git -C wt rev-parse --abbrev-ref @{u}` échoue) ;
- `.worktreeinclude` contenant `.env` : `.env` (ignoré) copié, `notes.md` (non suivi, non
  ignoré, mais qui correspond au motif) **non** copié ;
- branche existante → `needs_human`, aucun topic en base, slug réutilisable ;
- repo sans `.codegraph/` → `index_state = 'disabled'` ; avec → `indexing` puis `ready`
  (faux codegraph qui réussit) ou `failed` (faux qui sort en 1) ;
- trois `POST` simultanés sur le même workspace → trois sujets, aucun échec de verrou.

### 02.4 — `topic.cleanup`

Fichiers : `scripts/git/topic-cleanup.sh`, `src/daemon/topics/cleanup.ts`,
`test/topic-cleanup.test.ts`.

```bash
#!/usr/bin/env bash
set -euo pipefail
source "$(dirname "$0")/lib.sh"
require_env AID_REPO_ROOT AID_BRANCH AID_BASE AID_WORKTREE
if [ -d "$AID_WORKTREE" ] && [ -n "$(git -C "$AID_WORKTREE" status --porcelain)" ]; then
  git -C "$AID_WORKTREE" status --short >&2
  die_human "modifications non commitées : rien n'est supprimé"
fi
cd "$AID_REPO_ROOT"                       # jamais supprimer le worktree depuis l'intérieur
git worktree prune                        # worktree effacé à la main : on oublie son entrée
git fetch --quiet origin "$AID_BASE" || echo "fetch impossible : comparaison avec l'origin/$AID_BASE local" >&2
n=$(git rev-list --count "origin/$AID_BASE..$AID_BRANCH")
if [ "$n" -gt 0 ] && [ "${AID_CONFIRM_UNMERGED:-}" != "$n" ]; then
  printf '::aid:: {"unmergedCommits": %s}\n' "$n"
  die_human "$n commit(s) absents de origin/$AID_BASE : confirmer pour supprimer"
fi
if [ -f "$AID_WORKTREE/.codegraph/daemon.pid" ]; then
  kill "$(cat "$AID_WORKTREE/.codegraph/daemon.pid")" 2>/dev/null || true
fi
[ -d "$AID_WORKTREE/.codegraph" ] && codegraph uninit -f "$AID_WORKTREE" >/dev/null 2>&1 || true
[ -d "$AID_WORKTREE" ] && git worktree remove "$AID_WORKTREE"
git branch -D "$AID_BRANCH"               # sûr : les commits non fusionnés ont été confirmés ci-dessus
printf '::aid:: {"removed": true}\n'
```

Route : `POST /api/topics/:id/actions/topic.cleanup` `{ confirmUnmerged?: number }` →
409 si un agent du sujet a `status ∈ ('starting','working','needs_input','idle')` ;
sinon 202 `{ actionId }`. Succès → `topic.state { state: 'archived' }`. Le cwd du script est
le worktree (contrat §5) ; si le worktree n'existe plus, cwd = racine du repo, le script
saute le contrôle de propreté et la suppression du worktree, mais garde le contrôle des
commits non fusionnés.

Tests — **critère d'acceptation, ne pas en retirer** :
- fichier modifié non commité → `needs_human`, worktree et branche intacts ;
- fichier non suivi → idem ;
- commit local non poussé → `needs_human`, `result.unmergedCommits = 1`, intacts ;
- même cas avec `confirmUnmerged: 1` → supprimés ; avec `confirmUnmerged: 2` → refus ;
- branche identique à `origin/main` → supprimés, `archived` ;
- agent vivant (ligne insérée à la main) → 409 ;
- `.codegraph/daemon.pid` pointant un `sleep 300` lancé par le test → process tué.

### 02.5 — Ouvrir dans l'éditeur

Fichiers : `src/daemon/actions/editor.ts`, `test/editor.test.ts`.

```ts
export function defaultEditor(platform: NodeJS.Platform, hasCode: boolean): string[];
// hasCode (code dans le PATH) → ['code', '{path}'] ; sinon darwin → ['open', '-a', 'Visual Studio Code', '{path}']
// sinon linux → ['xdg-open', '{path}']
export function openInEditor(cmd: string[], path: string): void;
// spawn(cmd[0], cmd.slice(1).map(a => a === '{path}' ? path : a), { detached: true, stdio: 'ignore' }).unref()
```

`POST /api/topics/:id/actions/editor.open` → 204. Erreur `ENOENT` → 422 avec la commande
tentée et un renvoi vers `editor` dans `config.yaml`.

Tests : substitution de `{path}` sans shell (un chemin contenant `;` et des espaces arrive
intact en argument unique — utiliser un faux éditeur qui écrit `argv` dans un fichier).

## Pièges

- `git worktree add -b <b> <p> origin/main` **sans** `--no-track` pose `origin/main` comme
  amont : `git pull` tire main et `push.default=upstream` pousserait sur main.
- `git ls-files --others --ignored --exclude-from=F` liste aussi des fichiers **non**
  ignorés par le projet s'ils correspondent aux motifs de F : d'où le `git check-ignore`.
- `git worktree remove` lancé depuis l'intérieur du worktree : se placer à la racine.
- `git branch -d` refuse une branche fusionnée en *squash* : c'est voulu qu'on passe par la
  confirmation explicite plutôt que de « réparer » avec un `-D` inconditionnel.
- Un `fetch` qui attend un mot de passe ne produit aucune erreur, juste une attente :
  `GIT_TERMINAL_PROMPT=0` et `BatchMode=yes` sont obligatoires.
- Le titre d'un sujet ne va **jamais** dans une ligne de commande : il reste en base.

## Fini quand

- Tests verts, `npm run gate` vert.
- À la main, avec un repo de test : enregistrer, créer trois sujets d'un coup, constater
  trois worktrees ; nettoyer un sujet sale → refus lisible ; nettoyer un sujet propre → plus
  de worktree ni de branche.
