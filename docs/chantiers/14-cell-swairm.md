# 14 — Ouvrir la cell Swairm dans le terminal d'un sujet

Branche à créer pour le développement : `feat/cell-swairm`, depuis `main`.

Plan rédigé le 2026-10-25, repères relevés sur `589c3c2`. Cette livraison écrit
uniquement ce plan : aucun code, aucun commit, aucune modification du brief ni de
la table des chantiers. Les commits ci-dessous sont ceux de l'exécution future.

## Index structurel et rayon d'impact

CodeGraph CLI disponible dans ce worktree. Exploration effectuée symbole par symbole
avec `codegraph explore "<symbole>"`, puis par fichiers nommés pour compléter les
extraits tronqués. Relations candidates, non preuve de résolution typée : les homonymes
de `spawn` produisent notamment des dépendances étrangères à `AgentManager`.

Voici les dépendances et les mentions de tests rendues par l'index, sans compléter
artificiellement ses listes abrégées (`+N` est conservé tel quel). Ce sont les tests
directs ou trouvés dans les trois sauts d'appelants, pas une liste suffisante de validation.

| Symbole interrogé | Rayon rendu | Tests rendus |
| --- | --- | --- |
| `SpawnKind`, `src/daemon/pty/spawn.ts:5` | 7 appelants dans `reprise.ts`, `manager.ts`, `spawn.ts` | `test/pty-spawn.test.ts` |
| `AgentKind`, `src/shared/model.ts:17` | 1 appelant dans `model.ts` (`Agent`) | `test/web/carte.test.tsx`, `test/web/helpers.tsx` **+3** |
| `StateSnapshot`, `src/shared/state.ts:3` | 27 appelants ; `src/cli/commands/status.ts`, `web/src/data/client.ts`, `src/daemon/state/snapshot.ts`, `web/src/ecrans/Boite.tsx` | `test/state.test.ts`, `test/topic-create.test.ts`, `test/topic-fetch.test.ts`, `test/topic-merge.test.ts` **+9** |
| `AidConfig`, `src/daemon/config.ts:5` | 17 appelants ; routes topics, ws PTY, main, server **+2** | `test/helpers/daemon.ts`, `test/helpers/topics.ts` |
| `parseConfig`, `src/daemon/config.ts:101` | 3 appelants dans `config.ts` | `test/retention.test.ts`, `test/config.test.ts` |
| `registerAgentRoutes`, `src/daemon/routes/agents.ts:30` | 2 appelants dans `server.ts` | `test/securite.test.ts` |
| `AgentManager.spawn`, `src/daemon/pty/manager.ts:184` | `spawn` : 17 appelants, dont browser, editor, runner, native **+5**, avec homonymes ; `AgentManager:117` : 14 appelants, dont reprise, ws PTY, main, server **+1** | pour `spawn` : `test/runner.test.ts`, `test/reprise.test.ts` **+1** ; pour `AgentManager` : `test/securite.test.ts` |
| `gracefulInterrupt`, `src/daemon/pty/reprise.ts:31` | 2 appelants dans `src/cli/aid.ts` | `test/reprise.test.ts` |
| `runDoctor`, `src/cli/commands/doctor.ts:414` | 3 appelants dans `src/cli/aid.ts` | `test/doctor.test.ts` |

Exploration complémentaire : `promptDetected` (`heuristic.ts:25`) et `tickHeuristic`
(`manager.ts:146`) renvoient `test/heuristique.test.ts` ; `TerminalMirror`
(`mirror.ts:11`) renvoie `test/pty-reconnect.test.ts`. `Kind` et `KINDS` de Sujet :
« no tests found within 3 caller hops » ; les tests UI explicitement prévus restent nécessaires.

**Limite locale déclarée :** `codegraph explore "test/fixtures/fake-swarph.sh"` répond
« No relevant code found … no indexed file uniquely matches ». Ce seul modèle de
fixture a été lu directement, sans en déduire un rayon d'impact. Aucun repli pour le
code TypeScript. Les noms cachés derrière `+N` ne sont pas établis par cette sortie.

## Pourquoi

Ajouter « Ouvrir la cell Swairm » à côté des lancements Claude, Codex, shell et cell
swarph, dans la barre du sujet. Le bouton ouvre une session interactive du **CLI
Swairm**, en PTY, dans le worktree du sujet. Ce n'est pas une session Claude ni un vol
de drone distant.

Référence fonctionnelle : [brief Swairm](../brief-swairm-cell-cli.md), notamment §3,
S1–S10 et §9. Référence d'intégration et de forme : [chantier 12](12-mesh-swarph.md),
point 12.6. Les différences au §3 du brief sont explicites dans D42–D44 ; le brief
n'est pas recopié ni modifié ici.

## État actuel

| Zone | Constat vérifié et repères |
| --- | --- |
| Commande | `src/daemon/pty/spawn.ts:5,13-21` : `SpawnKind` comprend `swarph-cell` ; sa commande est `[mesh.bin, 'spawn', mesh.cellFile, '--no-starter', '--no-banner']`. `resolveOnPath:24-38` accepte aussi un chemin absolu exécutable. |
| Environnement | `spawn.ts:47-55` copie l'environnement puis retire `env.strip` et les marqueurs de session Claude ; ajoute les variables terminal et AID. `meshEnv:62-70` ajoute seulement des adresses pour `swarph-cell`. Aucun ajout Swairm à ce jour. |
| Lancement | `src/daemon/pty/manager.ts:184-241` vérifie sujet actif, worktree, run ; garde mesh et unicité à `197-210`, résolution/422 à `211-235`, `agentEnv` et hooks à `216-225`, PTY `xterm-256color` et cwd à `228-233`. La garde swarph parcourt tous les agents vivants, pas seulement ceux du sujet. |
| Modèle | `src/shared/model.ts:17-26` : union multiligne, `swairm-drone` et `swairm-queen` déjà présents ; ajouter un genre distinct. `Agent:113-135` transporte genre, commande et source/détail du statut. |
| Route agents | `src/daemon/routes/agents.ts:10,12,37` : trois listes de genres en dur (type TypeBox, enum JSON, assertion du body). Oublier l'enum donne 400 avant le manager. |
| Configuration | `src/daemon/config.ts:5-14,50-70,101-141` : type, défauts, parsing ; liste des clés racines à `107`. `parseMesh:219-246` sert de patron, `strOrEmpty:214-217` accepte la chaîne vide. |
| État exposé | `src/shared/state.ts:3-12` : `mesh?` optionnel. `src/daemon/state/snapshot.ts:26-31,126-137` ne reçoit que le service mesh et l'ajoute s'il existe. Chaîne de passage : `src/daemon/server.ts:119` → `src/daemon/routes/state.ts:9-19` → `buildSnapshot`. |
| Sujet | `web/src/ecrans/Sujet.tsx:56-63` : `Kind`, `KINDS`, `KIND_CELL`. À `265`, choix conditionné par `state.mesh`. À `267-275`, POST puis sélection du terminal créé et affichage de l'erreur. |
| Doctor | `src/cli/commands/doctor.ts:31-56` : `MeshProbe` et `Probes.mesh()` (`null` = désactivé) ; contrôles mesh à `221-263`, `realProbes.mesh` à `353-374`, `runDoctor` à `414-423`. |
| Reprise dangereuse | `src/daemon/pty/reprise.ts:38-55` n'exclut que `shell` : tout autre vivant reçoit une demande de résumé à `45`. `resumeFromManifest:65-100` relance à `86` et tape le résumé à `93`, sans filtre de genre. Une boucle de commandes Swairm recevrait ces textes comme des commandes. |
| Projet Git | `src/daemon/routes/workspaces.ts:134` stocke `remote: repo.hasOrigin ? 'origin' : null`, pas `owner/dépôt`. `inspectRepo`, `src/daemon/git/inspect.ts:42-49`, lit l'URL mais ne rend que `hasOrigin`. Ce worktree accepte les projets sans origin (`routes/workspaces.ts:108-117,156`) : l'affirmation contraire du brief S2 est historique. |

### Statut et invite (réponse à Q4)

`src/daemon/pty/manager.ts:141-168` sonde toutes les 2 s, mais **la ligne 148 exclut
actuellement tout sauf `claude` et `codex`**. Ajouter seulement le genre et le bouton
laisserait donc la cell sans estimation. Le point 14.3 doit admettre `swairm-cell`.

`src/daemon/pty/heuristic.ts:6-43` fonctionne ainsi :

- moins de 5 s de silence : `working`, sauf motif de demande présent depuis au moins 3 s ;
- motif détecté et au moins 3 s de silence : `needs_input`, prioritaire sur `idle` ;
- au moins 30 s de silence, sans motif : `idle` ; entre 5 et 30 s, maintien de l'état ;
- recherche des motifs dans les **huit dernières lignes non vides** : `(y/n)`, `(o/n)`,
  variantes entre crochets, choix `❯ 1. …` / `› 1. …` / `> 1. …`, questions
  « Do you want to… ? », « Would you like to… ? », « Voulez-vous… ? », « Veux-tu… ? ».

**Proposition à valider avec Swairm : `swairm> `**, ASCII, stable, projet dans l'en-tête
et non dans l'invite. Cette invite **ne déclenche pas** `promptDetected` : ici cette
fonction détecte une demande nécessitant l'opérateur, pas l'inactivité d'un CLI.
Pour obtenir `idle`, Swairm doit laisser cette invite visible, sans motif de demande
résiduel dans les huit lignes observées, et ne produire aucun octet pendant 30 s
(transition au prochain tick, normalement jusqu'à 2 s plus tard).

Un heartbeat, une horloge ou un redessin périodique réinitialise `lastOutputAt`
(`manager.ts:263-266`), même si l'écran paraît inchangé. Swairm peut sonder les boards
sans redessiner en l'absence de changement. Une arrivée réelle d'événement peut remettre
la cell en `working` : c'est une estimation d'activité terminal, pas l'état de la ruche.
`statusSource` reste `heuristic`, avec `silenceMs`, `lastLine`, `promptDetected` ; les
événements ne sont émis qu'aux transitions. Aucun nouveau motif ni seuil global prévu.

### Émulateur (réponse partielle à Q6)

`src/daemon/pty/mirror.ts:6-8,20-35,47-65` utilise `@xterm/headless` et
`SerializeAddon`, redimensionne le terminal, sérialise après la barrière d'écriture,
lit le buffer actif et expose `isAlternate`. Son `onData` n'est pas relié au programme
(`:10`) : le miroir ne répond pas lui-même aux requêtes du CLI.

Cela établit les mécanismes disponibles, **pas** la fidélité de la future cell.
**À vérifier en recette :** écran alternatif, curseur, souris si retenue, resize et
reconnexion avec le vrai Swairm ; Q1 (boucle ou plein écran) n'est pas tranchée.
Aucun changement de l'émulateur n'est inclus par anticipation.

## Cible et hors-périmètre

| Construit | Omis |
| --- | --- |
| `swairm.bin`, genre local `swairm-cell`, lancement `cell` en PTY, garde d'unicité, arrêt sans reprise | `swairm-drone` / `swairm-queen`, vols distants et création de sujets « par la ruche » |
| Indicateur de configuration optionnel dans l'instantané et bouton dans Sujet | Lecture directe d'un board SQLite par A-I-D, détection de board côté daemon, registre `owner/dépôt` |
| Estimation de statut, doctor limité au CLI et recette | Suivi permanent d'événements par le daemon (v0.4), nouveau service de polling |
| Saisie interactive ordinaire dans le terminal existant | Implémentation de l'écriture métier dans la session : phase B du brief, verbes validate/answer/merge… ; aucun formulaire ou automate A-I-D pour ces gestes |
| Tests avec faux exécutable et répertoires temporaires | Vrai Swairm, Claude, Codex ou réseau externe dans les tests ; tout jeton GitHub injecté dans la cell |

Pas de manifeste, CI, dépendance, version ni migration à changer. La configuration
applicative explicitement demandée est limitée à `swairm.bin` ; aucune modification de
la vraie configuration de l'opérateur pendant le développement.

## Décisions et propositions à valider

Recherche effectuée par `grep -n "D[0-9][0-9]" README.md docs/chantiers/*.md` : maximum
**D41**. On poursuit à D42. Les choix demandés cadrent le développement ; les questions
d'usage non tranchées restent en fin de plan.

- **D42 — CLI direct, projet déduit par Swairm.** Construire `[swairm.bin, 'cell']`,
  sans `--project`, sans shell intermédiaire. S2 du brief charge Swairm de déduire le
  projet depuis origin ou d'ouvrir la liste. Aucun nouvel appel Git dans le daemon.
  Cela remplace la commande avec `--project` esquissée au §3.
- **D43 — Configuration minimale et affichage.** `SwairmConfig { bin: string }`, défaut
  `bin: ''` (désactivé), parsing strict des clés. Pas de `swairm.boards` : A-I-D ne
  localise pas les boards. `StateSnapshot.swairm?: { enabled: true }` présent seulement
  si le binaire est configuré, indépendamment de mesh et sans exposer son chemin.
  Le bouton apparaît alors, même si le binaire manque sur disque (422 au lancement),
  même sans board. Ce choix remplace le filtre « board existant » du brief §3.
- **D44 — Une seule cell vivante par daemon pour ce chantier.** Même recherche globale
  que swarph, filtrée par `swairm-cell`, erreur 409 avec l'id de la cell déjà ouverte.
  Arrêt/sortie libère la garde ; une cell swarph peut coexister. C'est la borne demandée,
  pas une décision définitive sur une future cell par projet (Q2).
- **D45 — Cell non conversationnelle, jamais reprise.** Comme `shell`,
  `gracefulInterrupt` appelle seulement `agents.stop(id, 'daemon_stop')`, renvoie
  `null`, n'envoie aucun texte. Ajouter aussi un filtre de `swairm-cell` au début du
  traitement des entrées de `resumeFromManifest`, même pour un manifeste ancien ou
  fabriqué. Aucun spawn ni résumé injecté. Le comportement des autres genres reste intact.
- **D46 — Statut estimé, invite proposée.** Inclure uniquement le nouveau genre dans
  la garde d'heuristique ; conserver les seuils. Proposer `swairm> ` selon Q4 ci-dessus.
  Accord Swairm et comportement réel du redessin **à vérifier**, pas un contrat déjà livré.
- **D47 — Environnement commun, aucun secret GitHub ajouté.** Conserver `agentEnv`,
  les `AID_*` et `hookEnv` existants ; leur présence ne transforme pas la cell en Claude.
  Aucune lecture de credential, aucun `GH_TOKEN`/`GITHUB_TOKEN` injecté, aucun ajout
  mesh pour ce genre. Le code copie l'environnement du daemon : ne pas prétendre que
  tout secret préexistant serait supprimé. `AID_TOKEN` est le jeton de run existant,
  distinct d'un jeton GitHub ; ne jamais journaliser sa valeur dans une fixture.
- **D48 — Faux binaire avant livraison externe.** Tous les points 14.1–14.6 se
  développent et passent leurs gates sans Swairm. Le faux CLI a une invite stable,
  répond à des lectures locales déterministes et quitte sur SIGTERM. La recette réelle
  est une validation humaine séparée, bloquée par la livraison du CLI.
- **D49 — Doctor borné à ce chantier.** Section optionnelle : désactivé, exécutable
  introuvable, version illisible ou version lisible ; échecs Swairm en `warn`. Résoudre
  le chemin absolu avec `resolveOnPath`, ne pas copier aveuglément `p.has(mesh.bin)`.
  Appel `--version` sans shell, délai borné, jamais lancement de `cell` par doctor.
  Ne pas inventer de version minimale ni de schéma JSON pour S9 : le diagnostic complet
  `swairm doctor --json` et sa compatibilité attendent le contrat externe stabilisé.

## Points

Chaque point de développement est **un commit**, tests écrits avant ou avec le point.
Les repères ci-dessous sont ceux de la base relevée ; les lignes bougeront après 14.1.
Une plage est une zone d'insertion, pas une autorisation de réécrire son contenu.

### 14.1 — Configuration et genre local

Fichiers : `src/daemon/config.ts:5-14,50-70,107,138-141,214-219,288-289`,
`src/shared/model.ts:17-26`, `test/config.test.ts:17-49,120-159`.

- Ajouter `SwairmConfig`, le champ normalisé de `AidConfig`, les défauts et
  `parseSwairm` suivant `parseMesh` ; accepter la clé racine `swairm`, puis seulement
  `bin`, chaîne vide autorisée. Documenter le chemin absolu dans le modèle commenté
  `DEFAULT_FILE`, par insertion avant sa fermeture.
- Insérer `| 'swairm-cell'` avant une branche existante de `AgentKind`, sans déplacer
  le point-virgule final ni toucher aux genres distants.
- Tests ajoutés : section absente/vide, `bin: ''`, chemin absolu, chaîne simple,
  type invalide, section non objet, clé inconnue racine et sous-clé (`boards`, `token`
  refusés). Les défauts historiques sont conservés.

Dépassement assumé : `config.ts:107` (liste racine). Le reste s'insère.

Commit proposé : `feat(swairm): ajouter la configuration et le genre de cell`.
Preuve : `npm run gate` entier, environnement nettoyé selon « Fini quand ».

### 14.2 — PTY, route, unicité et absence de reprise

Fichiers : `src/daemon/pty/spawn.ts:5,13-21`,
`src/daemon/pty/manager.ts:197-235`, `src/daemon/routes/agents.ts:10,12,37`,
`src/daemon/pty/reprise.ts:38-41,75-77`,
`test/pty-spawn.test.ts:226-230`, `test/agents-routes.test.ts:70-84,129-131`,
`test/reprise.test.ts:32-54`, `test/fixtures/fake-swairm.sh` (nouveau, exécutable).

- Ajouter le genre à `SpawnKind` et aux trois listes de la route. Étendre
  `agentCommand` avec un quatrième argument optionnel `{ bin: string }` propre à
  Swairm ; pour ce genre, absence de configuration refusée, retour `[bin, 'cell']`.
  Garder les trois arguments et comportements existants pour les autres genres.
- Avant la construction de commande, refuser `config.swairm.bin` vide avec 409,
  puis toute cell Swairm vivante avec 409 ; passer la config au constructeur.
  Conserver 404 sujet absent, 409 sujet non actif/worktree absent/run absent,
  422 exécutable introuvable ou échec PTY. Aucun test de board.
- Réutiliser le PTY, cwd, env, logs et arrêt par paliers. Appliquer D45 dans les deux
  fonctions de reprise **dans ce même commit**, avant de rendre le genre lançable.
- Faux CLI : sur `cell`, afficher cwd/arguments et seulement des variables non
  sensibles utiles, invite `swairm> `, boucle de commandes locales, `quit`/EOF,
  pièges SIGTERM/SIGHUP (sortie 0) et SIGINT à l'invite. Journal d'entrées sous un
  chemin temporaire de test pour prouver qu'aucun résumé n'a été reçu. Pas d'enfant
  durable, pas de vrai binaire ni de réseau ; patron de structure : `fake-swarph.sh`.
- Tests : tableau exact `cell` sans `--project`, cwd du worktree, TERM/COLORTERM et
  présence des AID sans exposer leur contenu, pas d'ajout mesh/GitHub ; 201 HTTP
  et agent `transport: 'pty'`, 400 genre inconnu, 409 désactivé, 422 absent,
  unicité y compris depuis un second sujet, réouverture après arrêt, coexistence mesh.
- Dans `test/reprise.test.ts`, utiliser une préparation Swairm ajoutée, sans élargir
  l'ancien helper `spawn:20`. Vérifier arrêt `daemon_stop`, aucune entrée de manifeste,
  aucun appel `input` ; manifeste contenant `swairm-cell` ignoré sans spawn ni input.
  Garder les tests Claude/shell existants.

Dépassements assumés : `spawn.ts:5,13`, `manager.ts:211`,
`routes/agents.ts:10,12,37`, `reprise.ts:38`.
Le filtre de reprise au démarrage est une insertion après `reprise.ts:76`.

Commit proposé : `feat(swairm): ouvrir la cell en PTY sans reprise conversationnelle`.
Preuve : `npm run gate`, puis `npm run gate:e2e` entiers (route modifiée).

### 14.3 — Statut heuristique de la cell

Fichiers : `src/daemon/pty/manager.ts:146-168`,
`test/heuristique.test.ts:18-38,69-118` ; fonctions exercées sans modification :
`src/daemon/pty/heuristic.ts:6-43`.

- Admettre `swairm-cell` dans la garde de `tickHeuristic`, sans y admettre shell,
  swarph-cell ou les genres distants, sans modifier les seuils ni les motifs.
- Tests avant/avec : `swairm> ` donne `promptDetected: false`, `working` après sortie,
  maintien entre 5 et 30 s, puis `idle` à 30 s. Tester au niveau manager avec faux
  PTY, horodatage contrôlé et miroir vidé avant assertion : événement `heuristic`,
  détails attendus, pas d'événement répété sans transition. Un nouvel octet remet
  l'activité ; une question reconnue donne `needs_input` après 3 s.
- Tester un motif résiduel parmi les huit lignes et le silence réinitialisé par un
  redessin : ne pas promettre `idle` sur la seule présence de l'invite. Conserver
  l'exclusion des shells, agents arrêtés, en pause et ayant reçu un hook.

Dépassement assumé : `manager.ts:148` uniquement.

Commit proposé : `feat(swairm): estimer le statut de la cell sans hooks`.
Preuve : `npm run gate` entier.

### 14.4 — Instantané et bouton dans Sujet

Fichiers : `src/shared/state.ts:3-12`, `src/daemon/state/snapshot.ts:26-31,126-137`,
`src/daemon/routes/state.ts:9-19`, `src/daemon/server.ts:119`,
`web/src/ecrans/Sujet.tsx:56-63,265-275`, `test/state.test.ts:34-75`,
`test/web/sujet.test.tsx:23-27,65` (ajouts de cas, mock Terminal existant conservé).

- Ajouter `swairm?` selon D43. Passer un booléen optionnel de disponibilité, défaut
  `false`, en dernier paramètre de `registerStateRoutes` puis de `buildSnapshot`.
  `buildServer` le calcule depuis `deps.config.swairm.bin`. Aucun service Swairm,
  aucun chargement de config par requête, aucun couplage à `mesh`.
- Étendre `Kind`, ajouter `KIND_SWAIRM_CELL` avec le libellé exact « Ouvrir la cell
  Swairm », composer les choix en conservant l'ordre des choix existants puis ce
  nouveau choix. Le POST existant choisit le terminal et affiche les erreurs 409/422.
- Tests état : absence quand désactivé, présence quand configuré même sans mesh ou
  board ; les anciens constructeurs de snapshot restent valides grâce au champ
  optionnel. Test HTTP pour vérifier le passage réel de la config à l'instantané.
- Tests UI : les quatre combinaisons mesh/Swairm, libellé et ordre, POST exact
  `{ topicId, kind: 'swairm-cell' }`, sélection du nouvel agent, affichage de l'erreur
  de doublon. Aucun bouton n'exige de connaître un board.

Dépassements assumés : `server.ts:119`, `routes/state.ts:19`,
`Sujet.tsx:56,265`. Les paramètres optionnels et champs se rajoutent en lignes nouvelles.

Commit proposé : `feat(swairm): proposer la cell dans la barre du sujet`.
Preuve : `npm run gate`, puis `npm run gate:e2e` entiers.

### 14.5 — Diagnostic du binaire

Fichiers : `src/cli/commands/doctor.ts:31-57,221-265,285-299,353-375`,
`test/doctor.test.ts:13-28,294-302`, `test/fixtures/fake-swairm.sh`
(créé en 14.2 : numéros futurs à relever, pas de fausse référence actuelle).

- Ajouter `SwairmProbe` et `Probes.swairm()` (`null` si désactivé), sa réalisation
  et un bloc de checks indépendant du mesh. Le résultat distingue résolution du
  binaire et lecture de version ; `--version` via `execFile`, sans shell et avec le
  délai 5 s du patron `run:285-289`.
- Ligne désactivée en `ok` ; binaire absent ou version illisible en `warn`, avec
  correctif concret : vérifier le lien/l'interpréteur du clone de déploiement et
  `swairm.bin` absolu. Ne pas annoncer « cell compatible » sur la seule version.
- Tests : compléter par insertion l'objet `good` de `test/doctor.test.ts:13-28`,
  absence/configuration/chemin absolu exécutable/introuvable/version en échec.
  Le faux CLI gagne `--version` et un mode d'échec déterministe ; vérifier qu'aucun
  appel à `cell`, GitHub ou SQLite board n'a lieu. Tester aussi `realProbes` sur la
  fixture, pas seulement le rendu d'une sonde simulée.

Insertion prévue uniquement ; pas de changement de `has` ni de la boucle des autres CLI.

Commit proposé : `feat(swairm): diagnostiquer le binaire configure`.
Preuve : `npm run gate` entier.

### 14.6 — Parcours e2e et grille de recette

Fichiers : `e2e/global-setup.ts:13-27`, `e2e/cell-swairm.spec.ts` (nouveau),
`docs/recette-cell-swairm.md` (nouveau, emplacement proposé).
Patron documentaire : [recette mesh](../recette-v0.4-mesh.md).

- Ajouter au YAML de test `swairm.bin` pointant vers le faux CLI, avec `AID_HOME`
  temporaire existant. Ne jamais reprendre le `~/.aid/config.yaml` réel.
- Écrire l'e2e avec le point : ouvrir un sujet, cliquer le bouton, voir l'invite,
  saisir une commande de lecture factice, recharger/reconnecter et retrouver le même
  agent/terminal ; second lancement refusé ; arrêt puis nouvelle ouverture possibles.
  Tester le resize et la persistance du terminal avec la fixture. Le non-redémarrage
  automatique est déjà prouvé en 14.2 ; la recette vérifie le cycle réel.
- Rédiger la grille ci-dessous en séparant couverture automatique et cases manuelles
  non cochées. Documenter le délai `idle`, la dépendance externe et les chemins absolus.

Dépassement assumé : `e2e/global-setup.ts:27` pour inclure la section dans le YAML
écrit. Aucun changement de port par défaut, de CI ni de configuration Playwright.

Commit proposé : `test(swairm): couvrir le parcours de cell et documenter la recette`.
Preuve : `npm run gate`, puis `npm run gate:e2e` entiers.

## Recette réelle — attend la livraison Swairm

Ce n'est pas un septième commit de code. La grille créée en 14.6 ne sera renseignée
qu'après exécution humaine ; aucun résultat réel n'est prétendu dans ce plan.

**Dépendance externe :** selon le brief du 2026-10-25, `swairm cell` n'existe pas encore
et `~/.swairm/deploy` est en retard sur `~/Projects/swairm`. **À vérifier** au moment
de la recette : versions effectivement déployées, présence de `cell`, `--version` et
contrat S9 ; les deux dépôts externes n'ont pas été inspectés dans cette tâche.
Cela ne bloque aucun développement 14.1–14.6 avec le faux binaire.

Prérequis opérateur :

- livrer le mode session puis mettre à jour le clone `~/.swairm/deploy` et son environnement ;
- placer un lien `swairm` sur le PATH du shell, vérifier qu'il lance le bon clone ;
- poser `swairm.bin` **en chemin absolu** dans `~/.aid/config.yaml` : le PATH du daemon
  n'est pas celui du shell. Exemple à adapter :

  ```yaml
  swairm:
    bin: /Users/vous/.local/bin/swairm
  ```

- vérifier `swairm --version`, puis `aid doctor` ; le chemin de l'exemple est **à vérifier**,
  il n'est ni créé ni confirmé par ce plan ; redémarrer le daemon pour charger sa config
  (le bouton et le lancement lisent tous deux la config chargée au démarrage : changer
  `swairm.bin` sans redémarrer ne change rien) ;
- disposer d'un sujet actif avec worktree et d'un projet doté d'un board, puis d'un
  dépôt sans board et d'un dépôt sans origin pour tester les replis S2 ; convenir de Q1/Q4.

Grille à porter dans `docs/recette-cell-swairm.md` :

- [ ] Sans configuration : bouton absent ; avec configuration : bouton visible à côté
  de la cell swarph. Binaire absent : 422 lisible, pas de terminal fantôme.
- [ ] Depuis le sujet : session `swairm cell`, cwd du worktree, bon projet déduit ;
  commande enregistrée sans `--project`. Aucun lancement de Claude.
- [ ] `help`, `status`, `inbox`, `events` restent dans la session ; apparition d'un
  nouvel événement selon S1. Mesurer démarrage (Q5), ne pas supposer une seconde.
- [ ] Sans board ou origin : liste des projets, pas fermeture de session (S2) ;
  confirmer avec l'opérateur que ce repli est bien l'expérience souhaitée.
- [ ] Invite stable et écran sans motif résiduel : après 30 s sans octet, statut
  inactif estimé ; événement réel puis retour au silence. Un rafraîchissement incessant
  est consigné comme incompatibilité Q4, pas masqué par un seuil modifié.
- [ ] Redimensionner de 80 à 200 colonnes, masquer/réouvrir l'onglet, recharger la page,
  vérifier aperçu et écran complet ; écran alternatif et souris si retenus (Q6).
- [ ] Second clic, y compris depuis un autre sujet : 409 avec cell existante ; coexistence
  d'une cell swarph et d'une cell Swairm ; arrêt puis réouverture réussie.
- [ ] `quit`, Ctrl-D, Ctrl-C à l'invite et pendant un suivi, arrêt A-I-D : sortie propre,
  curseur/modes restaurés, aucun enfant orphelin ; SIGTERM conforme à S4.
- [ ] Cycle du daemon : cell arrêtée avec `daemon_stop`, aucun texte de résumé reçu,
  aucune cell relancée automatiquement ; réouverture manuelle retrouve les données S6.
- [ ] Aucun jeton GitHub ajouté par A-I-D ; ne pas confondre avec le jeton AID de run,
  ne pas imprimer ni recopier de secrets pour cette vérification.

## Pièges et contrôle insertion-only

Les remplacements ci-dessous sont les **dépassements assumés attendus**, limités aux
lignes nécessaires. Ils ne constituent aucune autorisation de refactoriser. Les types
en dur restent en dur : extraire une constante partagée est hors périmètre.

| Point | Lignes existantes remplacées (base `589c3c2`) | Motif |
| --- | --- | --- |
| 14.1 | `src/daemon/config.ts:107` | clé racine acceptée |
| 14.2 | `src/daemon/pty/spawn.ts:5,13` | union sur une ligne et signature |
| 14.2 | `src/daemon/pty/manager.ts:211` | passage de la configuration Swairm |
| 14.2 | `src/daemon/routes/agents.ts:10,12,37` | type TypeBox, enum JSON, type du body |
| 14.2 | `src/daemon/pty/reprise.ts:38` | exclusion de la cell du résumé |
| 14.3 | `src/daemon/pty/manager.ts:148` | admission dans l'heuristique |
| 14.4 | `src/daemon/server.ts:119`, `src/daemon/routes/state.ts:19` | passage du booléen de disponibilité |
| 14.4 | `web/src/ecrans/Sujet.tsx:56,265` | union et composition des choix |
| 14.6 | `e2e/global-setup.ts:27` | section Swairm du YAML temporaire |

Soit **14 anciennes lignes ciblées** au total avant déplacements de repères. Prettier
peut étaler une nouvelle signature sur plusieurs lignes ; cela n'autorise pas à toucher
aux lignes voisines. `AgentKind` étant déjà multiligne, son ajout peut rester une
insertion avant la branche finale. Tests : ajouter des cas, ne pas réécrire les anciens
helpers ni retirer des assertions. Tout autre remplacement découvert doit être nommé
et justifié avant développement, pas noyé dans un reformatage.

Après chaque commit futur :

```bash
git --no-pager show <COMMIT> | grep -E "^-" | grep -vE "^---" | wc -l
```

Comparer aussi les chemins et les lignes supprimées à ce tableau, pas seulement le
compte. Aucun commit n'est fait lors de la rédaction du présent plan.

## Fini quand

- Le bouton ouvre le CLI interactif dans le bon PTY ; API et UI respectent disponibilité,
  unicité et erreurs, sans board lu par A-I-D.
- Le genre distinct est suivi en statut estimé ; aucun résumé ni reprise ne lui est envoyé.
- Chaque point développé a son commit et ses tests ; diff limité aux ajouts et aux
  remplacements recensés, sans modification de manifeste, CI ou version.
- `npm run gate` est vert **en entier**, puis `npm run gate:e2e` en entier pour les
  points modifiant route/UI et pour la livraison finale. Les tests ciblés ne remplacent
  jamais ces gates. Node 22 est requis ; le gate est aussi à vérifier sous Node 24
  avant livraison conformément aux instructions du dépôt, sans contourner un échec.
- Retirer **toutes** les variables `AID_*` héritées avant les commandes. Pour les e2e,
  réintroduire seulement `AID_E2E_PORT=4873` et utiliser `mise exec node@22 --` :
  4871 est pris par AID.app. Exemples exécutables sans modifier le shell parent :

  ```bash
  python3 - <<'PY'
  import os, subprocess
  env = {k: v for k, v in os.environ.items() if not k.startswith('AID_')}
  subprocess.run(['mise', 'exec', 'node@22', '--', 'npm', 'run', 'gate'], env=env, check=True)
  PY

  python3 - <<'PY'
  import os, subprocess
  env = {k: v for k, v in os.environ.items() if not k.startswith('AID_')}
  env['AID_E2E_PORT'] = '4873'
  subprocess.run(['mise', 'exec', 'node@22', '--', 'npm', 'run', 'gate:e2e'], env=env, check=True)
  PY
  ```

- Tout échec annoncé préexistant est reproduit sur la base sans le diff, avec fichier,
  message exact et base datée dans le handoff ; aucun skip ni seuil abaissé.
- Recette réelle renseignée après disponibilité de Swairm ; tant qu'elle attend,
  annoncer « intégration testée sur faux binaire, recette réelle en attente ».

Validation de cette **rédaction seule** : Prettier sur ce fichier uniquement. Les gates
applicatifs et la recette ne sont pas exécutés pour un chantier encore au stade du plan.

## Questions ouvertes et ce qui reste à établir

1. **Q4 — Invite :** valider `swairm> ` avec Swairm et l'opérateur. La détection A-I-D
   est lue ; la cadence d'affichage réelle et l'absence de motifs résiduels restent
   **à vérifier**, car `cell` n'est pas livrée. Si Swairm exige un redessin permanent,
   revoir explicitement le contrat avant de modifier l'heuristique.
2. **Q2 — Une cell par projet ou globale ?** Le développement demandé borne à une
   seule cell vivante par daemon. L'opérateur doit confirmer l'usage futur (session
   naviguant entre projets ou sessions par projet) ; aucune clé d'unicité par projet
   ni nouveau réglage ne sont anticipés ici.
3. **Bouton sans board :** la proposition suit S2 (liste des projets dans la session)
   et le bouton reste visible. Confirmer cette expérience avec l'opérateur ; le
   comportement réel du futur CLI reste **à vérifier**, jamais simulé comme acquis.
4. **Q1/Q6 — Interface et émulateur :** choix boucle/plein écran non arrêté ; fidélité
   du mode retenu, souris, restauration, resize et reconnexion **à vérifier** avec le
   vrai CLI. Le miroir existant ne suffit pas à prouver ces comportements.
5. **Livraison externe, S8/S9, Q5 :** version disponible dans les deux clones, schéma
   exact de `swairm doctor --json`, version minimale compatible et temps de démarrage
   **à vérifier** côté Swairm. Aucun accès aux clones ni mesure réalisé dans cette tâche.
6. **Limites du rayon :** noms masqués par les `+N` de CodeGraph non établis ; fixture
   shell non indexée, lue directement. Les gates entiers couvrent au-delà de ce rayon
   candidat, mais leur résultat futur n'est pas encore établi.

Les autres questions du [brief §9](../brief-swairm-cell-cli.md#9-questions-ouvertes-et-points-à-vérifier)
(notamment écriture et cockpit) restent à leurs responsables, hors de ce chantier.
