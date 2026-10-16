# Recette de la v0.3 Git flow

Grille du plan 06.11. Suit l'issue aid #12 / `feat/12-spool-replay` de la maquette
(`design/maquettes/git-flow/`), écran par écran, de 2.1 à 2.9. Contrairement à la v0.1, le
parcours a besoin d'un vrai `gh` authentifié sur un dépôt de test avec une remote GitHub
réelle : aucune case ne peut être cochée depuis une session automatisée sans ces
identifiants. Les lignes « couverture automatique » listent ce que `npm run gate` vérifie
déjà sur le même chemin, avec un faux `gh` (`test/fixtures/`, jamais le vrai binaire).

## Préalable

- [ ] Dépôt de test dédié sur GitHub (pas le dépôt d'A-I-D lui-même), remote `origin`
  accessible en push, `gh auth status` vert sur le poste de recette.
- [x] `aid doctor` signale « gh non authentifié » distinctement de « gh introuvable »
  (`test/doctor.test.ts`)

## Poste : macOS (M5)

- [ ] 2.1 Nouveau sujet : le formulaire crée un sujet `draft` en base avant que le
  worktree existe ; aperçu de la commande affiché correspond à la branche/base réelles
  — couverture automatique : `test/topics.test.ts`, `test/web/sujet.test.tsx`
- [ ] 2.2 Préparation : sortie de `topic-create.sh` suivie en direct ; « Ignorer » abandonne
  le brouillon et libère immédiatement le slug pour un nouveau sujet — couverture
  automatique : `test/topic-create.test.ts`, `test/web/sujet.test.tsx`
- [ ] 2.3 Synchronisation, chemin heureux : avance/retard affichés en direct (jamais stockés
  en base), rebase sans conflit, « Lancer les tests » exécute `npm test` du sujet et
  affiche le résultat — couverture automatique : `test/topic-sync.test.ts`,
  `test/topic-test.test.ts`
- [ ] 2.4 Conflit de sync : rebase en conflit détecté (code 2), fichiers en conflit listés,
  « Annuler » rend le worktree propre — couverture automatique : `test/topic-sync.test.ts`
- [ ] 2.5 Ouvrir la PR : `gh pr create` avec titre/description du formulaire, transition
  vers `review`, URL et numéro de PR affichés ; `gh` non authentifié affiche l'état vide
  de la maquette, pas une erreur brute — couverture automatique : `test/topic-pr.test.ts`
- [ ] 2.6 Revue : `gh pr view --json` rafraîchi à l'ouverture de l'écran et sur clic,
  vérifications et revues reflètent l'état réel de la PR sur GitHub — couverture
  automatique : `test/topic-pr-refresh.test.ts`
- [ ] 2.7 Fusion : les trois stratégies (squash/merge/rebase), option de nettoyage
  enchaîné après fusion, refus de GitHub (protection de branche) affiché tel quel —
  couverture automatique : `test/topic-merge.test.ts`
- [ ] 2.8 Nettoyage : fichier non commité → refus par défaut (inchangé depuis 02), mis de
  côté dans un stash, ou supprimé de force avec confirmation explicite — couverture
  automatique : `test/topic-cleanup.test.ts`
- [ ] 2.9 Archivé : chronologie du sujet rejoue les événements réels (création, sync, PR,
  revue, fusion, nettoyage) ; « Retirer la mention du stash » supprime le stash laissé par
  2.8 — couverture automatique : `test/topic-archive.test.ts`
- [ ] Un même sujet traverse `draft → active → review → merged → archived` sans jamais
  recharger la page, du formulaire 2.1 jusqu'à l'archive 2.9

## Ce que la recette a révélé (corrigé)

Un parcours de bout en bout a été mené le 2026-10-16 contre un vrai dépôt GitHub jetable
(`morzu117/aid-recette-v03`), un vrai `gh auth status` authentifié, et le démon réel
construit depuis ce worktree — piloté directement en HTTP (jeton bearer), pas depuis le
navigateur. **Ceci couvre la logique réelle backend/git/gh de bout en bout, pas la
vérification visuelle des écrans macOS** : les cases ci-dessous restent décochées, un
humain doit encore dérouler 2.1 à 2.9 dans le vrai navigateur.

Deux sujets exercés : un parcours heureux complet (brouillon → actif → sync → tests →
PR → revue → fusion squash → nettoyage confirmé → archivé) et un second sujet dédié au
conflit de sync et au nettoyage avec stash.

Trouvé et corrigé (06.12) : `topic.pr` échouait réellement (`No commits between main et
<branche>`) — aucun script ne poussait la branche vers `origin` avant `gh pr create`.
Voir le commit `fix(topics): 06.12` pour le détail et la couverture ajoutée.

Trouvé, non corrigé, remonté pour arbitrage :

- **Détection squash-merge (D7, 2.7/2.8)** : après une fusion squash réelle et réussie,
  `topic.cleanup` revient en `needs_human` avec `unmergedCommits: 1` — la comparaison de
  SHA locaux (`git rev-list origin/<base>..<branche>`, inchangée depuis le chantier 02)
  ne reconnaît pas un squash-merge comme fusionné, puisque GitHub crée un commit de SHA
  différent. Documenté comme risque connu dans le tableau v0.1 (« détection par `gh` en
  v0.3 »), jamais implémenté par ce chantier. Sans danger — aucune perte, juste une
  confirmation manuelle systématique après un squash-merge.
- **`gitLiveInfo` jamais câblée (2.3)** : la fonction existe et est testée directement
  (`test/topic-sync.test.ts`), mais n'est appelée nulle part ailleurs dans le code —
  ni dans `Topic` (`shared/model.ts`), ni dans `snapshot.ts`, ni dans l'UI web.
  L'« avance/retard en direct » promise pour l'écran 2.3 n'est pas branchée de bout en
  bout malgré sa couverture unitaire.
- **`stashRef` perdu si stash + commits non fusionnés se chevauchent (2.8)** : quand
  `topic.cleanup` stash un worktree sale (`dirtyAction: "stash"`) *et* que la branche a
  des commits non fusionnés, le script stashe bien avant de bloquer sur la confirmation
  — mais la réponse `needs_human` ne contient que `unmergedCommits`, jamais `stashRef`.
  Le stash existe réellement (vérifié via `git stash list` dans le worktree), mais rien
  dans la réponse API ni dans l'UI n'en informe l'appelant avant qu'il ne confirme et que
  le nettoyage se termine — à ce moment-là la seconde invocation du script ne retrouve
  plus rien à stasher et ne le rapporte pas non plus. Reproduit le 2026-10-16 sur le sujet
  `recette-conflit-et-stash`. Sans perte de travail (le stash reste listé par `git stash
  list`), mais invisible depuis l'interface tant que personne ne va chercher à la main.

## Points ouverts pour la suite

- Les cases d'écran (2.1 à 2.9) n'ont pas pu être cochées : elles demandent une
  vérification visuelle dans le vrai navigateur macOS, que cette session n'a pas faite
  (elle a piloté l'API HTTP du démon directement). La logique backend/git/gh qu'elles
  recouvrent a cependant été exercée réellement — voir ci-dessus. Un humain doit encore
  dérouler cette grille en UI avant de considérer la v0.3 livrable (voir « Fini quand »
  de `docs/chantiers/06-git-flow.md`).
- `topic-pr-refresh` et `topic-merge` n'ont pas d'écran e2e Playwright dédié (`e2e/`) —
  seuls `cleanup.spec.ts`, `reconnexion.spec.ts`, `repli-index.spec.ts` et
  `trois-sujets.spec.ts` existent à ce jour ; aucun point du plan 06 n'en demandait un
  nouveau, mais la recette manuelle ci-dessus reste le seul filet pour 2.3 à 2.9.
