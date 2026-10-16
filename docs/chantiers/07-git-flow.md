# 07 — Git flow (sujet draft → sync → PR → fusion → archive)

## Pourquoi

Les écrans 2.1 à 2.9 (`design/maquettes/git-flow/`, jalon v0.3 de la spec) décrivent tout le
cycle de vie d'un sujet que `topic.create` et `topic.cleanup` (chantier 02) ne couvrent
qu'aux deux bouts : créer le worktree et le supprimer. Entre les deux, rien n'existe
aujourd'hui pour se synchroniser avec la base, ouvrir une PR, la fusionner, ni pour
abandonner un sujet avant même que son worktree existe. Ce chantier construit ces actions
et les écrans qui les exposent, sans toucher à ce que 02 et 04 ont déjà livré.

## État actuel

- `TopicState` (`src/shared/model.ts:3`) contient déjà les cinq états `draft | active |
  review | merged | archived`, et la contrainte `CHECK` de `topics.state`
  (`migrations/001_init.sql:19`) les accepte tous. Seuls `active` et `archived` sont
  jamais écrits par le code (`src/daemon/routes/topics.ts`).
- `POST /api/topics` (`topics.ts:63`) : le sujet n'existe en base qu'après le succès de
  `topic-create.sh` — branche et worktree sont créés avant la première ligne en base.
  Les écrans 2.1 (formulaire) et 2.2 (préparation en cours) supposent l'inverse : un sujet
  `draft` visible, consultable, abandonnable, **avant** que `git worktree add` tourne.
- `scripts/git/{lib.sh,topic-create.sh,topic-cleanup.sh}` sont les seuls scripts d'action.
  `TOPIC_ACTIONS` (`topics.ts:20`) ne connaît que `topic.cleanup` et `editor.open`. Rien
  pour `topic.sync`, `topic.pr`, `topic.merge` (listés comme hors périmètre explicite par
  02 et par le README, §1 « Spec v1 révisée »).
- `topic-cleanup.sh:11-16` refuse tout net (`die_human`) dès qu'un `git status --porcelain`
  n'est pas vide. L'écran 2.8 montre deux issues à ce refus (mettre de côté dans un stash,
  ou supprimer sans garder) que le script ne sait pas faire.
- `syncTopicBranches` (`src/daemon/state/syncBranches.ts`, livré hors chantier pour corriger
  un badge périmé) interroge déjà `currentBranch()` à chaque `GET /api/state` et réémet
  `topic.branch` si la branche réelle a changé. C'est le seul précédent de donnée git lue
  en direct plutôt que stockée ; ce chantier l'étend au lieu d'inventer un second mécanisme.
- `web/src/ecrans/Sujet.tsx` n'a pas de branche pour `topic.state === 'draft'` : un sujet
  sans worktree y tombe dans le bandeau « Worktree introuvable » (`Sujet.tsx:244-258`),
  qui est faux pour un brouillon (rien n'a jamais existé à supprimer).
- `useNettoyage.ts` et `ConfirmerNettoyage.tsx` gèrent déjà le refus sur commits non
  fusionnés (confirmation qui répète le compte exact) ; le même shape de `phase` sert de
  modèle pour `useSync`.
- `src/cli/commands/doctor.ts:93` attend déjà `gh` : `['gh', 'requis à partir de la v0.3
  (PR et fusion)']`. Le choix de `gh` plutôt qu'un client REST + jeton géré par A-I-D est
  donc déjà pris ailleurs dans le code ; ce chantier s'y conforme (D17).
- Aucun champ PR n'existe sur `Topic` : ni URL, ni numéro, ni référence de stash.

## Cible et hors-périmètre

### Ce qu'on construit, ce qu'on omet

| Écran | Construit | Omis (et pourquoi) |
| --- | --- | --- |
| 2.1 Nouveau sujet | Formulaire, sujet `draft` créé en base avant le worktree, aperçu de la commande | — |
| 2.2 Préparation | Suivi de `topic.create` en cours (sortie du script en direct), abandon avant worktree | `topic.create-existante` (adopter un worktree/branche déjà sur disque, hors maquette détaillée — voir D15) |
| 2.3 Synchronisation | `topic.sync` (fetch + rebase), compte d'avance/retard en direct, « Lancer les tests » | D20 : v0.3 lance `npm test` en dur, registre configurable hors périmètre |
| 2.4 Conflit | Détection du conflit (code 2), liste des fichiers, continuer / annuler le rebase | Résolution assistée des conflits (un éditeur externe résout ; A-I-D ne fait qu'orchestrer git) |
| 2.5 Ouvrir la PR | `topic.pr` (`gh pr create`), titre/description pré-remplis, brouillon | Suggestions de titre/description générées par un modèle |
| 2.6 Revue | `pr.rafraichir` (`gh pr view --json`), vérifications et revues affichées, commentaires en lecture | Transmettre un commentaire à un agent (`commentaire.transmettre`) ; grokbot lui-même (v0.4) |
| 2.7 Fusion | `topic.merge` (`gh pr merge`), stratégie/message/options, nettoyage enchaîné | Protection de branche configurable dans l'UI (on affiche le refus de GitHub tel quel) |
| 2.8 Nettoyage | Extension de `topic.cleanup` : mettre de côté (stash) ou forcer sur fichiers non commités | Windows (dossier verrouillé par un process) : message d'erreur affiché tel quel, pas de détection préalable |
| 2.9 Archivé | Chronologie (rejoue les événements du sujet), oublier un stash laissé par 2.8 | Rétention des journaux déjà couverte par 03 ; rien de neuf ici |

Transitions d'état ajoutées : `draft → active` (déjà prévu, juste avancé dans le temps),
`active → review` (`topic.pr`), `review → active` (`topic.retour-active`), `review →
merged` (`topic.merge`), `merged → archived` (`topic.cleanup`, inchangé). Un `draft`
abandonné ne devient **pas** `archived` : voir D15.

Hors périmètre, confirmé par le README (§1) et non remis en cause ici : entité `Tâche`
(sous-worktrees), configurabilité complète du registre d'actions, Swairm.

## Décisions prises

- **D15 — Sujet `draft` avant le worktree, et slug libéré si abandonné.** `POST
  /api/topics` insère la ligne `topics` tout de suite, état `draft`, avec `branch`/`base`/
  `worktree` déjà calculables (`<type>/<slug>`, `ws.base_branch`,
  `join(worktreesDir, slug)`) sans que rien n'existe sur disque — ces colonnes restent
  `NOT NULL` sans changement de schéma. `startAction('topic.create', ...)` se lance dans la
  foulée ; son `afterSuccess` ne fait plus qu'un `topic.state { state: 'active' }` (plus
  l'`INSERT`, déjà fait). Abandon (`topic.setup-ignorer`, uniquement si `state === 'draft'`)
  : **suppression** de la ligne `topics` et de son run implicite, dans une transaction,
  sans toucher à `topic-cleanup.sh` (rien n'existe à nettoyer sur disque). C'est ce qui
  « lève l'unicité » pour le slug : la ligne qui la portait disparaît. Aucune migration de
  schéma requise. Le journal d'événements garde la trace (`topic.state` vers `draft` puis
  l'historique s'arrête) ; seule la projection disparaît, comme pour toute projection.
  `topic.create-existante` (adopter un couple branche/worktree préexistant) reste hors
  périmètre : la maquette ne le détaille pas au-delà d'un bouton d'état vide.
- **D16 — `topic.sync` : avance/retard lus en direct, jamais stockés.** Nouveau script
  `scripts/git/topic-sync.sh` (même contrat que les deux scripts existants). Il fait
  `git fetch origin <base>`, puis soit démarre un rebase (`git rebase origin/<base>`), soit
  le poursuit si `AID_SYNC_CONTINUE=1` (présence de `.git/rebase-merge` ou
  `rebase-apply` dans le worktree → `git add -A && git rebase --continue`), soit l'annule
  (`AID_SYNC_ABORT=1` → `git rebase --abort`). Un conflit sort en code 2 avec
  `::aid:: {"conflict": true, "files": [...]}` (`git diff --name-only --diff-filter=U`).
  Le compte d'avance/retard (`sujet.retard_base`) et l'état « rebase en pause » ne sont
  **pas** stockés en base : ils se lisent comme `syncTopicBranches` lit déjà la branche,
  dans une fonction étendue (`gitLiveInfo(worktree)` dans `src/daemon/git/inspect.ts`) qui
  fait les trois lectures (`symbolic-ref`, `rev-list --left-right --count`, test d'existence
  de `.git/rebase-merge`) en un seul passage par sujet à chaque `GET /api/state`. Même
  raisonnement que pour la branche : une valeur qui dérive hors d'A-I-D (rebase lancé à la
  main) ne doit jamais être une source de vérité stockée.
- **D17 — `gh` CLI pour tout ce qui touche GitHub, pas de client REST.**
  `doctor.ts:93` l'attend déjà ; les scripts `topic-pr.sh` et `topic-merge.sh` appellent
  `gh pr create`/`gh pr view --json`/`gh pr merge` en JSON, exactement comme les maquettes
  l'affichent dans leurs encarts « commande » (ex. 2.7 : `gh pr merge 48 --squash
  --delete-branch`). A-I-D ne gère ni jeton ni authentification GitHub : `gh auth status`
  est vérifié par `aid doctor`, un échec renvoie l'état vide « gh non authentifié » déjà
  prévu par la maquette (2.5).
- **D18 — Une PR se lit à la demande, jamais poussée.** `pr.rafraichir` est une action
  classique (`startAction`) qui relance `gh pr view --json
  statusCheckRollup,reviews,mergeable,title,body,url,number` et republie le résultat dans
  `actions.result`, comme toute action. Pas de webhook (aucun endpoint public), pas de
  websocket dédié. L'UI relance l'action à l'ouverture de l'écran 2.6 et sur clic
  explicite ; aucun sondage automatique en tâche de fond en v0.3.
- **D19 — `topic.sync`, `topic.pr`, `topic.merge` partagent la file d'exécution du
  workspace.** Même `WorkspaceQueue` que `topic.create`/`topic.cleanup`
  (`src/daemon/actions/queue.ts`), pas de file par sujet. Un `fetch` touche les refs
  partagées du dépôt (`.git/refs/remotes/...`) même depuis un worktree lié : deux fetchs
  simultanés sur le même repo restent un risque de verrou de refs, identique à celui déjà
  noté pour `git worktree add` (README §2).
- **D20 — « Lancer les tests » (écran 2.3) : commande fixe en v0.3, pas de registre
  configurable.** `topic.test` lance `npm test` en dur dans le worktree, via le même
  `runScript`. Tranché pour le chantier 07 : la configurabilité complète du registre
  d'actions (mentionnée comme hors périmètre v0.1 et v0.3 par le README) resterait un
  chantier à part entière, et rien dans les maquettes ou le brief n'exige aujourd'hui
  autre chose que `npm test` — pas de couche de config par workspace pour un seul
  réglage sans second cas d'usage connu. Révisable sans migration de schéma le jour où
  un deuxième projet a besoin d'une autre commande.
- **`Topic.prUrl` et le numéro de PR.** Migration `003_topic_pr.sql` :
  `ALTER TABLE topics ADD COLUMN pr_number INTEGER; ALTER TABLE topics ADD COLUMN pr_url
  TEXT; ALTER TABLE topics ADD COLUMN stash_ref TEXT;`. `pr_number`/`pr_url` sont écrits
  par l'`afterSuccess` de `topic.pr` (lu dans la sortie `::aid::` du script) et effacés à
  l'archivage. `stash_ref` est écrit par `topic.cleanup` quand `nettoyage.choix = stash`
  (D21) et affiché par l'écran 2.9 ; `archive.oublier-stash` le vide après
  `git stash drop <stash_ref>` sur `ws.root` (état vide de la maquette : « stash
  introuvable » si la ref ne résout plus rien — on l'efface quand même).
- **D21 — Nettoyage avec fichiers non commités (écran 2.8).** `topic-cleanup.sh` apprend
  une variable `AID_DIRTY_ACTION` : absente ou vide → comportement actuel (refus, code 2,
  inchangé pour la rétrocompatibilité des tests 02). `stash` → avant le reste du script,
  `git -C "$AID_WORKTREE" stash push -u -m "aid/$AID_SLUG"`, la ref captée par
  `git stash list --format='%H %gs'` et renvoyée dans le `::aid::` final
  (`{"removed": true, "stashRef": "..."}`) pour que l'`afterSuccess` l'écrive dans
  `topics.stash_ref`. `force` → le check de dirty (lib.sh, étape 1) est sauté et
  `git worktree remove --force` remplace `git worktree remove` à l'étape finale ; la case
  à cocher de confirmation (`nettoyage.confirmer`) est un garde-fou côté daemon : la route
  refuse (422) un `dirtyAction: 'force'` sans `confirmed: true` dans le corps.

## Points

### 07.1 — Sujet `draft` avant le worktree

Fichiers : `src/daemon/routes/topics.ts`, `test/topics.test.ts` (ajouts).

- `POST /api/topics` : insère `topics` (état `draft`) et le run implicite **avant**
  `startAction`. `afterSuccess` de `topic.create` ne fait plus que
  `topic.state { state: 'active' }` (plus d'`INSERT`).
- Nouvelle action `topic.setup-ignorer` dans `TOPIC_ACTIONS` : 409 si `state !== 'draft'`,
  sinon transaction qui `DELETE FROM runs WHERE topic_id = ?` puis `DELETE FROM topics
  WHERE id = ?` (pas de script, rien sur disque). Pas d'événement `topic.state` après
  suppression — la ligne n'existe plus, un événement sur un `topicId` disparu serait
  trompeur à rejouer.
- Test : créer un sujet, vérifier `state().topics[0].state === 'draft'` avant que l'action
  `topic.create` ait fini, `topic.setup-ignorer` puis recréer le **même** slug avec succès.

Vérification : `npm run gate`.

### 07.2 — Écrans 2.1 et 2.2 côté UI

Fichiers : `web/src/ecrans/Sujet.tsx`, `web/src/ecrans/NouveauSujet.tsx` (nouveau, si
inexistant — vérifier d'abord s'il y a déjà un dialogue de création, sinon s'inspirer de
`ConfirmerNettoyage.tsx`), `web/src/ecrans/useNettoyage.ts` → modèle pour un
`useSujetBrouillon.ts` équivalent.

- `Sujet.tsx` : avant le test `topic.worktreeMissing`, une branche `topic.state ===
  'draft'` affiche l'écran 2.2 (progression de `topic.create`, bouton « Ignorer » →
  `topic.setup-ignorer`). Le bandeau « Worktree introuvable » ne reste que pour
  `state !== 'draft'`.
- Test : `test/web/sujet.test.tsx`, cas `draft` qui ne doit **jamais** afficher le bandeau
  d'erreur existant.

Vérification : `npm run gate`.

### 07.3 — `topic.sync`, chemin heureux (écran 2.3)

Fichiers : `scripts/git/topic-sync.sh` (nouveau), `src/daemon/git/inspect.ts`
(`gitLiveInfo`), `src/daemon/state/syncBranches.ts` → étendu ou renommé `syncLive.ts` (à
trancher par l'exécutant selon la taille du diff, sans renommer l'export déjà testé si
évitable), `src/daemon/routes/topics.ts` (ajout `topic.sync` à `TOPIC_ACTIONS`),
`test/topic-sync.test.ts`.

- Script : contrat D16. `AID_REPO_ROOT AID_BRANCH AID_BASE AID_WORKTREE` requis, comme les
  deux scripts existants.
- `gitLiveInfo(worktree, base)` : retourne `{ branch, aheadBehind: {ahead, behind} | null,
  rebaseInProgress: boolean }` en trois appels `git` ; intégré au même passage que
  `syncTopicBranches` pour ne pas doubler les lectures git par sujet et par tick.
- Test : rebase sans conflit, vérifie l'avance/retard avant/après, vérifie l'absence de
  régression sur `topic.branch` (test existant de `syncBranches.test.ts`, s'il existe déjà
  — sinon écrit en 07.3).

Vérification : `npm run gate`.

### 07.4 — Conflit de sync (écran 2.4)

Fichiers : `scripts/git/topic-sync.sh` (chemin conflit), `src/daemon/routes/topics.ts`
(actions `topic.sync-continuer`, `topic.sync-annuler`), `test/topic-sync.test.ts`
(complété).

- Conflit : sortie 2, `::aid:: {"conflict": true, "files": [...]}`. Les deux nouvelles
  actions passent `AID_SYNC_CONTINUE=1` / `AID_SYNC_ABORT=1`.
- Test : rebase avec conflit fabriqué (deux commits qui touchent la même ligne dans le
  dépôt de test), vérifie le code 2, la liste de fichiers, puis `sync-annuler` qui rend le
  worktree propre.

Vérification : `npm run gate`.

### 07.5 — `topic.test` (bouton « Lancer les tests »)

Fichiers : `scripts/git/topic-test.sh` (nouveau, `npm test` en dur — D20),
`src/daemon/routes/topics.ts`.

- Script minimal : `cd` déjà fait par `cwd: topic.worktree` du côté daemon ; le script ne
  fait que `npm test`, code de sortie répercuté tel quel (pas de `die_human` : un test rouge
  n'est pas une « action humaine requise », c'est un échec normal).
- Test : `npm test` remplacé par le faux agent de test dans l'environnement du test (jamais
  un vrai `npm test` récursif) — vérifier comment 02/03 ont déjà isolé ce genre
  d'exécution et réutiliser le même motif.

Vérification : `npm run gate`.

### 07.6 — Ouvrir la PR (écran 2.5)

Fichiers : `migrations/003_topic_pr.sql` (nouveau, D « `Topic.prUrl` »),
`src/shared/model.ts` (`Topic.prNumber`, `Topic.prUrl`), `src/daemon/state/snapshot.ts`,
`scripts/git/topic-pr.sh` (nouveau), `src/daemon/routes/topics.ts` (action `topic.pr`),
`test/topic-pr.test.ts`.

- Script : `gh pr create --title "$AID_PR_TITLE" --body "$AID_PR_BODY" --base "$AID_BASE"
  --head "$AID_BRANCH"`, lit l'URL et le numéro retournés par `gh` (format JSON avec
  `--json` sur un `gh pr view` qui suit juste après, pour un contrat de sortie uniforme),
  les renvoie en `::aid::`.
- `afterSuccess` : `topic.state { state: 'review' }` + écrit `pr_number`/`pr_url`.
- `gh` non authentifié → `gh auth status` en tête de script, `die_human` avec le message
  affiché par la maquette (état vide 2.5).
- Test : faux `gh` dans `test/fixtures/` (même motif que `fake-agent.sh`), vérifie la
  transition d'état et les colonnes écrites.

Vérification : `npm run gate`.

### 07.7 — Revue (écran 2.6)

Fichiers : `scripts/git/topic-pr-refresh.sh` (ou fonction partagée avec 07.6),
`src/daemon/routes/topics.ts` (action `pr.rafraichir`), UI : nouvel écran ou section dans
`Sujet.tsx` pour `state === 'review'` (vérifications, revues, lien PR).

- `gh pr view "$AID_PR_NUMBER" --json statusCheckRollup,reviews,mergeable,title,body,url`.
- Pas de transition d'état : cette action ne fait que rafraîchir `actions.result`, lu par
  l'UI.
- Test : faux `gh` qui renvoie un JSON de vérifications en cours puis vertes, vérifie que
  l'UI (ou au minimum l'API) reflète le changement entre deux appels.

Vérification : `npm run gate`.

### 07.8 — Fusion (écran 2.7)

Fichiers : `scripts/git/topic-merge.sh` (nouveau), `src/daemon/routes/topics.ts` (action
`topic.merge`), UI : fenêtre de fusion (modale, `data-layer="overlay"` — suivre le motif
déjà en place pour `ConfirmerNettoyage`).

- Script : `gh pr merge "$AID_PR_NUMBER" --squash|--merge|--rebase [--delete-branch]`
  selon la stratégie choisie, message de commit transmis par `AID_MERGE_MESSAGE` pour la
  stratégie squash/merge. Refus de GitHub (protection de branche) remonté tel quel en
  `die_human` (pas de message réécrit par A-I-D — la maquette prévoit cet état d'erreur
  brut).
- `afterSuccess` : `topic.state { state: 'merged' }`. Si la case « nettoyer le sujet juste
  après » est cochée, enchaîne immédiatement un `topic.cleanup` (même motif que
  `afterSuccess` qui peut déjà déclencher une seconde chose en 02 — vérifier dans
  `startAction`/`WorkspaceQueue` qu'un enchaînement dans la même file ne crée pas de
  deadlock avant de l'écrire ainsi).
- Test : stratégies squash/merge/rebase, option de nettoyage enchaîné.

Vérification : `npm run gate`.

### 07.9 — Nettoyage étendu : stash ou suppression forcée (écran 2.8)

Fichiers : `scripts/git/topic-cleanup.sh` (modifié — insertion seule, ne pas réordonner le
script existant), `src/daemon/routes/topics.ts` (corps de `topic.cleanup` accepte
`dirtyAction` et `confirmed`), `test/topic-cleanup.test.ts` (complété).

- Conforme à D21. Le refus par défaut (sans `dirtyAction`) reste identique à 02 : aucun
  test existant de `topic-cleanup.test.ts` ne doit changer de résultat.
- 422 si `dirtyAction === 'force'` sans `confirmed: true`.
- Test : trois chemins — refus par défaut (inchangé), `stash` qui laisse `stash_ref` non
  nul en base et un worktree propre, `force` qui supprime malgré le non-commité.

Vérification : `npm run gate`.

### 07.10 — Archive (écran 2.9)

Fichiers : UI pour `state === 'archived'` dans `Sujet.tsx` (chronologie = relecture des
événements du sujet, déjà tous en base — pas de nouvelle table), action
`archive.oublier-stash` (`src/daemon/routes/topics.ts`).

- Chronologie : `GET` existant suffit si l'UI filtre `events` par `topicId` — vérifier
  s'il existe déjà une route de lecture du journal par sujet (sinon, ajouter une route
  minimale `GET /api/topics/:id/events`, en lecture seule, hors du modèle `startAction`).
- `archive.oublier-stash` : `git -C <ws.root> stash drop <stash_ref>` si la ref résout
  encore (sinon état vide « stash introuvable », on vide quand même la colonne).
- Test : sujet archivé avec `stash_ref`, oubli du stash, re-vérifie que la colonne est
  vide même si le stash avait déjà été supprimé à la main.

Vérification : `npm run gate`.

### 07.11 — `aid doctor` et recette

Fichiers : `src/cli/commands/doctor.ts` (vérifier que le message déjà présent couvre bien
`gh auth status`, pas seulement la présence du binaire), `test/doctor.test.ts`,
`docs/recette-v0.3.md` (nouveau, sur le modèle de `recette-v0.1.md`).

- Grille de recette manuelle : un sujet du formulaire jusqu'à l'archive, avec un vrai `gh`
  sur un dépôt de test, en suivant exactement l'issue aid #12 / `feat/12-spool-replay` de
  la maquette pour comparer les écrans un à un.

Vérification : `npm run gate` et `npm run gate:e2e`.

## Pièges

- Ne pas réordonner `topic-cleanup.sh` existant au-delà de ce que D21 demande : le script
  est déjà couvert par les tests de 02, et la contrainte d'insertion-only du kernel
  s'applique en premier lieu à ce fichier.
- `git fetch` concurrent sur le même dépôt depuis deux worktrees liés : rester dans la
  même `WorkspaceQueue` (D19), ne pas être tenté par une file plus fine « pour aller plus
  vite ».
- Le compte d'avance/retard et le statut de rebase ne doivent **jamais** être écrits dans
  `topics` : toute tentative de les stocker réintroduit exactement le bug que
  `syncTopicBranches` vient de corriger pour la branche.
- `gh pr merge` peut réussir côté GitHub avant que le script ne confirme (coupure réseau
  après l'appel) : `afterSuccess` doit tolérer un second `topic.merge` sur un sujet déjà
  `merged` sans le traiter en erreur bloquante (409 propre, pas une 500).
- Les faux `gh`/`npm` de test ne doivent jamais appeler les vrais binaires : suivre
  exactement le motif de `test/fixtures/fake-agent.sh` (variable d'environnement qui
  pointe vers le faux binaire, jamais une modification du `PATH` système du poste).
- Le compteur `resume.en_attente` de la barre et le reste de l'écran 1.2 (boîte de
  réception) restent hors périmètre : ne pas être tenté de les brancher sur les nouveaux
  événements de revue (`pr.rafraichir`) sous prétexte qu'ils existent maintenant.

## Fini quand

- Les neuf écrans (2.1 à 2.9) ont une implémentation qui suit, sujet pour sujet, le
  parcours de l'issue aid #12 de la maquette.
- `npm run gate` et `npm run gate:e2e` verts en entier.
- Un sujet peut être abandonné en `draft` et son slug immédiatement réutilisé (test
  automatique, pas seulement manuel).
- Un sujet peut traverser `draft → active → review → merged → archived` avec de vrais
  appels `gh` en recette manuelle, consignée dans `docs/recette-v0.3.md`.
- Aucun test de 02 ou 04 n'a changé de résultat.
