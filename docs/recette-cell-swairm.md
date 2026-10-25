# Recette de la cell Swairm (chantier 14)

Grille du point 14.6 du plan `docs/chantiers/14-cell-swairm.md`. Deux niveaux :

- **couverture automatique** — ce que `npm run gate` et `npm run gate:e2e` vérifient déjà sur
  le même chemin, avec le faux CLI `test/fixtures/fake-swairm.sh` (D48). Jamais le vrai
  Swairm, aucun réseau, aucun board lu, aucun jeton GitHub.
- **recette manuelle** — le vrai CLI Swairm, à dérouler par Julien sur le Mac. Aucune case de
  cette partie ne peut être cochée depuis une session automatisée : elle exige que
  `swairm cell` existe.

**État : intégration testée sur faux binaire, recette réelle en attente.** Aucun résultat
réel n'est consigné ici tant que la grille manuelle n'a pas été déroulée.

## Dépendance externe

Selon le brief du 2026-10-25 (`docs/brief-swairm-cell-cli.md`), `swairm cell` n'existe pas
encore et `~/.swairm/deploy` est en retard sur `~/Projects/swairm`. Les deux dépôts externes
n'ont pas été inspectés pour ce chantier. **À vérifier** au moment de la recette : versions
effectivement déployées, présence de `cell`, de `--version`, et contrat S9. Cela ne bloque
aucun développement avec le faux binaire.

## Prérequis humains

- [ ] Mode session livré côté Swairm, puis clone `~/.swairm/deploy` et son environnement mis
      à jour (fait le 2026-10-25 côté Swairm : `754697c`, `swairm --version` et `swairm doctor`
      verts, `swairm cell --project <owner/dépôt>` rend l'invite `swairm> ` et sort en 0 sur
      SIGTERM ; A-I-D le lance **sans** `--project`, la déduction par l'`origin` reste à voir
      ici. Défaut cosmétique relevé côté Swairm : l'en-tête affiche « lu il y a jamais »)
- [ ] Un lien `swairm` sur le PATH du shell, qui lance le bon clone
- [ ] `swairm.bin` posé **en chemin absolu** dans `~/.aid/config.yaml` : le PATH du daemon
      n'est pas celui du shell. Exemple à adapter, le chemin est **à vérifier**, il n'est ni
      créé ni confirmé par ce chantier :

  ```yaml
  swairm:
    bin: /Users/vous/.local/bin/swairm
  ```

- [ ] `swairm --version` répond, puis `aid doctor` : la ligne Swairm n'est pas en `warn` —
      couverture automatique : `test/doctor.test.ts`
- [ ] Daemon redémarré pour charger sa config (`aid stop` puis `aid`) : la config est lue une
      seule fois au démarrage, et c'est elle qui décide à la fois de l'apparition du bouton
      (`server.ts`) et du lancement (`manager.ts`). Changer `swairm.bin` sans redémarrer ne change
      rien, ni dans un sens ni dans l'autre
- [ ] Un sujet actif avec worktree, sur un projet doté d'un board ; un dépôt sans board et un
      dépôt sans origin pour les replis S2 ; Q1 (boucle ou plein écran) et Q4 (invite)
      convenues avec l'opérateur

## Couverture automatique

Le faux CLI affiche `FAKE_SWAIRM cwd=… argc=… args=…`, quelques variables (présentes ou
absentes, jamais leur valeur), l'invite `swairm> `, puis répond à `help`, `status`, `inbox`,
`events`, `quit`. Il journalise ses appels (`FAKE_SWAIRM_LOG`) et ses entrées
(`FAKE_SWAIRM_INPUT_LOG`).

| Ce qui est couvert                                                                            | Où                                             |
| --------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Configuration `swairm.bin`, clés inconnues refusées                                           | `test/config.test.ts`                          |
| Commande exacte `<bin> cell` sans `--project`, cwd, TERM, pas d'ajout mesh ni GitHub          | `test/pty-spawn.test.ts`                       |
| 201 / 400 / 409 désactivé / 409 doublon (y compris autre sujet) / 422 absent, réouverture     | `test/agents-routes.test.ts`                   |
| Arrêt `daemon_stop` sans résumé, manifeste ignoré sans spawn ni saisie                        | `test/reprise.test.ts`                         |
| Statut estimé : `working`, maintien, `idle` à 30 s, `needs_input`, motif résiduel, redessin   | `test/heuristique.test.ts`                     |
| Instantané `swairm?` présent seulement si configuré ; bouton et ordre ; erreur de doublon     | `test/state.test.ts`, `test/web/sujet.test.tsx` |
| Diagnostic du binaire : désactivé, absent, version illisible, version lisible                 | `test/doctor.test.ts`                          |
| Parcours complet : bouton, invite, saisie, rechargement, autre vue, resize, doublon, arrêt    | `e2e/cell-swairm.spec.ts`                      |

Ce que `e2e/cell-swairm.spec.ts` établit : le bouton vient de la seule configuration (ni
board ni mesh) ; la commande de l'agent est `[bin, 'cell']` dans le worktree du sujet ;
`GH_TOKEN`, `GITHUB_TOKEN`, `MESH_GATEWAY_URL` et `SWARPH_SELF` sont absents de la session ;
le rechargement de la page et une seconde vue retrouvent le même agent et le même écran ; le
resize change la taille du terminal et l'écran survit ; un second lancement est refusé avec
l'id de la cell ouverte, y compris depuis un autre sujet ; après l'arrêt, la cell se rouvre
et ne reçoit que ce que l'opérateur tape. Le non-redémarrage automatique du daemon est
prouvé par `test/reprise.test.ts` ; la recette vérifie le cycle réel.

## Poste : macOS — recette manuelle

- [ ] 14.a Sans configuration : bouton absent ; avec configuration : bouton « Ouvrir la cell
      Swairm » visible à côté de la cell swarph. Binaire absent : 422 lisible, pas de
      terminal fantôme — couverture automatique : `test/web/sujet.test.tsx`,
      `test/agents-routes.test.ts`
- [ ] 14.b Depuis le sujet : session `swairm cell`, cwd du worktree, bon projet déduit ;
      commande enregistrée sans `--project`. Aucun lancement de Claude — couverture
      automatique de la commande : `e2e/cell-swairm.spec.ts`
- [ ] 14.c `help`, `status`, `inbox`, `events` restent dans la session ; un nouvel événement
      apparaît selon S1. Mesurer le démarrage (Q5), ne pas supposer une seconde.
- [ ] 14.d Sans board ou sans origin : liste des projets, pas de fermeture de session (S2) ;
      confirmer avec l'opérateur que ce repli est bien l'expérience souhaitée.
- [ ] 14.e Statut estimé : invite stable et écran sans motif de demande résiduel dans les
      huit dernières lignes non vides ; après **30 s sans aucun octet**, statut inactif estimé
      (la transition arrive au tick suivant, jusqu'à 2 s plus tard) ; un événement réel
      remet la cell en `working`, puis retour au silence. Un heartbeat, une horloge ou un
      redessin périodique réinitialise le silence : consigner cela comme incompatibilité Q4,
      ne pas le masquer par un seuil modifié — couverture automatique :
      `test/heuristique.test.ts`
- [ ] 14.f Redimensionner de 80 à 200 colonnes, masquer puis rouvrir l'onglet, recharger la
      page ; vérifier l'aperçu et l'écran complet ; écran alternatif et souris si retenus
      (Q6) — couverture automatique du resize et de la reconnexion sur le faux CLI :
      `e2e/cell-swairm.spec.ts` (ne prouve pas la fidélité du vrai CLI)
- [ ] 14.g Second clic, y compris depuis un autre sujet : 409 avec la cell existante ;
      coexistence d'une cell swarph et d'une cell Swairm ; arrêt puis réouverture réussie —
      couverture automatique : `e2e/cell-swairm.spec.ts`, `test/agents-routes.test.ts`
- [ ] 14.h `quit`, Ctrl-D, Ctrl-C à l'invite et pendant un suivi, arrêt depuis A-I-D :
      sortie propre, curseur et modes restaurés, aucun enfant orphelin ; SIGTERM conforme à S4
- [ ] 14.i Cycle du daemon (`aid stop` puis `aid`) : cell arrêtée avec `daemon_stop`, aucun
      texte de résumé reçu, aucune cell relancée automatiquement ; la réouverture manuelle
      retrouve les données S6 — couverture automatique : `test/reprise.test.ts`
- [ ] 14.j Aucun jeton GitHub ajouté par A-I-D ; ne pas confondre avec le jeton `AID_TOKEN`
      du run ; ne rien imprimer ni recopier de secret pour cette vérification — couverture
      automatique : `test/pty-spawn.test.ts`, `e2e/cell-swairm.spec.ts`

## Ce que la recette a révélé

**La recette manuelle n'a pas été déroulée** : `swairm cell` n'est pas livrée. Seule la
couverture automatique a tourné, sur le faux binaire. Rien n'est consigné ici pour le vrai CLI.

À savoir pour lancer les e2e sur ce poste (déjà consigné dans `docs/recette-v0.4-mesh.md`) :
le port 4871 est écouté par `AID.app` (`AID_E2E_PORT=4873` contourne), le gate exige Node 22
(`mise exec node@22 --`), et les variables `AID_*` héritées d'une session A-I-D sont à retirer
de l'environnement avant le gate.
