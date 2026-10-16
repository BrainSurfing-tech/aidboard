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

_À compléter une fois la recette manuelle effectuée avec un vrai `gh`._

## Points ouverts pour la suite

- Aucune case ci-dessus n'a pu être cochée par la session qui a construit ce chantier :
  elle n'a ni jeton `gh` ni dépôt GitHub de test. Un humain doit dérouler cette grille
  avant de considérer la v0.3 livrable (voir « Fini quand » de `docs/chantiers/06-git-flow.md`).
- `topic-pr-refresh` et `topic-merge` n'ont pas d'écran e2e Playwright dédié (`e2e/`) —
  seuls `cleanup.spec.ts`, `reconnexion.spec.ts`, `repli-index.spec.ts` et
  `trois-sujets.spec.ts` existent à ce jour ; aucun point du plan 06 n'en demandait un
  nouveau, mais la recette manuelle ci-dessus reste le seul filet pour 2.3 à 2.9.
