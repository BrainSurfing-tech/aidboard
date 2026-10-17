# 09 — Fusion du noyau : agent-kernel devient le module `kernel` d'aidboard

Branche : `feat/fusion-noyau`, depuis `main`.

## 1. Pourquoi

Direction prise le 2026-10-17 (agent-kernel, `docs/analyse-indexation-code-2026-10-17.md`
§9-10) : A-I-D est le centre, `aid mem` le socle commun de mémoire, et **agent-kernel
disparaît comme dépôt séparé pour devenir un module d'aidboard** (adapters, policy, rôles,
rendu `/sync`, bootstrap). Le chantier 06 a fait porter la capacité `memory` par le daemon ;
le chantier 08 a fait pareil pour `structural_index`. Les deux capacités que le noyau nomme
dans `policy/routing.md` sont donc déjà des capacités du daemon aidboard — ce qui reste dans
agent-kernel n'est plus que la politique elle-même (routage, phases, orchestration, rôles) et
sa mécanique de distribution (`/sync`, le gabarit, le bootstrap).

Aujourd'hui cette mécanique installe les choses à l'envers : `agent-kernel/scripts/
bootstrap-machine.sh` clone **aidboard** à un SHA épinglé (`AIDBOARD_SHA`) comme une de ses
dépendances machine, au même rang que Node ou Ollama. C'est l'inverse de la direction
retenue : le centre ne peut pas être une dépendance installée par sa propre périphérie. Ce
chantier inverse la relation : aidboard embarque et distribue le contenu du noyau, agent-kernel
cesse d'exister comme dépôt à cloner et à maintenir à part.

Ce que ce chantier n'est pas : une réécriture de la politique elle-même (routage, phases,
orchestration, taxonomie mémoire) — son contenu ne change pas de sens, seulement d'adresse et
de mécanique de distribution ; ni le pont mémoire ↔ code (table de liens, extracteurs
Prisma/HTTP) ; ni le banc Kivgraph — les deux restent des chantiers aidboard à ouvrir,
indépendants de celui-ci.

## 2. État actuel

- Dépôt `agent-kernel` : 35 fichiers suivis, ~4 016 lignes, presque entièrement déclaratif.
  - `adapters/*.md` (8 fichiers, 707 lignes) — contrat par capacité : `aid.md` (`memory`),
    `codegraph.md` (`structural_index`), `claude.md`/`claude-dev.md` (rôles courants),
    `codex.md`, `gbrain.md`, `swairm.md`, `vibe.md`.
  - `policy/*.md` (4 fichiers, 369 lignes) — `routing.md`, `orchestration.md`, `phases.md`,
    `namespace.md`. Le cœur normatif : rien n'y nomme un outil, seulement des rôles.
  - `roles/*.md` (5 fichiers, 188 lignes) — prompts par phase (`plan`, `dev`, `review`,
    `triage`, `retro`).
  - `commands/sync.md` (154 lignes) — la commande slash `/sync` elle-même : un agent la lit
    et rend `CLAUDE.md`/`AGENTS.md` depuis `templates/instructions.tmpl.md` (164 lignes) et
    le manifeste `agent.yml` du projet.
  - `defaults.yml`, `manifest.schema.yml`, `agent.example.yml` — défauts machine, schéma et
    exemple du manifeste projet.
  - `scripts/bootstrap-machine.sh` (320 lignes) — installe Node, codegraph, **aidboard** (clone
    + SHA épinglé + `npm install -g`), Ollama et les modèles, idempotent, `--check` seul.
  - `scripts/migrate-0.6-slugs.sh`, `migrate-0.9-memory.sh` — migrations déjà appliquées,
    historiques.
  - `VERSION` (`0.9.0`), `CHANGELOG.md`, et ses propres `docs/chantiers/01-04` (adoption
    d'`aid` comme adaptateur `memory`, `/sync` et défauts, bootstrap/setup, migration des
    données) — déjà exécutés, pas à rejouer.
- Distribution actuelle : geste manuel unique (`cp commands/sync.md ~/.claude/commands/`),
  puis `/sync` lit tout depuis `~/.agent-kernel`, un **clone git séparé** que chaque machine
  tient à jour par `git pull`. `defaults.yml`, `manifest.schema.yml` et le gabarit sont
  référencés par ce chemin dans `commands/sync.md` lui-même.
- `aid` est distribué en CLI npm (confirmé par les commits récents d'agent-kernel sur le
  contournement d'un bug `npm install -g` sur une ref git) : un poste qui l'installe ainsi
  n'a **aucun** fichier markdown du noyau sur disque — seul un clone source en aurait.
- Chaque projet déjà rattaché porte un `agent.yml` commité (`kernel.version` épinglé en exact
  ou en `main`) et un bloc rendu entre `<!-- agentkit:start VERSION -->` / `<!-- agentkit:end
  -->` dans `CLAUDE.md`/`AGENTS.md`. Le bloc rendu ne référence jamais `~/.agent-kernel` en
  dur ; seuls `commands/sync.md` et `SETUP.md` (lus côté machine, pas côté projet) le font.
- Adaptateurs déjà morts au sens de `defaults.yml` (`dev_agent: claude-dev`,
  `review_agent: claude`, décidé le 2026-09-01) : `codex.md` et `vibe.md` ne sont plus les
  défauts. `gbrain.md` est marqué déprécié depuis 0.9.0, retrait prévu en 1.0 (`commands/
  sync.md` §2 bis : avertit, rend quand même).
- Rien côté aidboard n'anticipe cette fusion : les seules mentions d'« agent-kernel » dans
  `aidboard/docs/` sont des références de dépendance ponctuelles (README §9, chantiers 00,
  06, 08). Aucune collision de nom : aidboard n'a pas de dossier `kernel/` à la racine.

## 3. Cible et hors-périmètre

Cible : aidboard embarque un dossier `kernel/` (reprise verbatim d'`adapters/`, `policy/`,
`roles/`, `templates/`, `commands/`, `defaults.yml`, `manifest.schema.yml`,
`agent.example.yml`), publié dans le package npm (`package.json` → `files`). Une commande
`aid kernel install` matérialise ce contenu vers `~/.agent-kernel` et installe `commands/
sync.md` dans `~/.claude/commands/`, en remplacement du clone git séparé — **aucun chemin
existant ne change** (`~/.agent-kernel/...` reste la racine lue par `/sync`, par
`defaults.yml`, par le gabarit). Le bootstrap machine migre dans `aidboard/scripts/` et
s'inverse : il installe `aid` (npm, plus de clone+SHA d'aidboard par lui-même), puis appelle
`aid kernel install` à la place de cloner un second dépôt. `kernel.version` dans `agent.yml`
se confond avec la version d'aidboard ; un `kernel/CHANGELOG.md` séparé du changelog général
du daemon ne reçoit une entrée que lorsque le contenu du noyau change réellement, pour que la
détection de migration de `/sync` (étape 2, comparaison de versions) reste pertinente même
quand aidboard sort une version purement daemon (sans rien dans `kernel/`).

Hors périmètre :

- Toute réécriture de `policy/*.md`, `roles/*.md` ou de la logique du `/sync` (résolution du
  manifeste, substitution du gabarit, DoD, orchestration) — leur contenu ne change pas, seule
  son adresse et sa mécanique de distribution changent.
- Migration de masse des `agent.yml` déjà commités dans les projets existants au-delà de ce
  que `/sync` fait déjà seul, à l'invocation suivante.
- Retrait immédiat de `codex.md`/`vibe.md`/`gbrain.md` : signalé en piège, pas en point de ce
  chantier (un projet existant peut encore les référencer).
- Le pont mémoire ↔ code et le banc Kivgraph — chantiers aidboard distincts, déjà annoncés
  par les chantiers 06 et 08.
- La publication réelle d'une version npm d'aidboard embarquant `kernel/` — ce chantier livre
  le mécanisme, pas la bascule en production de chaque machine existante.

## 4. Décisions prises

- **DS1 — Matérialisation, pas de clone séparé** (validé par Julien). Le contenu du noyau vit
  dans aidboard, embarqué dans le package publié. `aid kernel install` l'écrit sur
  `~/.agent-kernel` ; il ne reste plus aucun `git clone`/`git pull` d'un second dépôt.
- **DS2 — Version unique** (validé par Julien). `kernel.version` se confond avec la version
  d'aidboard (`aid --version`). Le `CHANGELOG.md` racine d'aidboard reste le journal du
  daemon ; `kernel/CHANGELOG.md` est sa sous-séquence filtrée au contenu du noyau, seule
  lecture pertinente pour `/sync` §2.
- **DS3 — Le chemin `~/.agent-kernel` ne change pas de nom.** Renommer casserait `SETUP.md`,
  `commands/sync.md` et l'habitude acquise (`grep agentkit:start`) pour un gain nul : seul son
  mécanisme de remplissage change (écrit par `aid kernel install`, plus par un clone git).
- **DS4 — Le bootstrap machine migre et s'inverse.** `aidboard/scripts/bootstrap-machine.sh`
  installe `aid` (npm, versions épinglées comme aujourd'hui pour Node/codegraph/Ollama), puis
  appelle `aid kernel install` — il ne clone plus jamais aidboard lui-même à un SHA.

Ce que l'exécutant ne décide pas : le contenu normatif de `policy/*.md`/`roles/*.md` (repris
verbatim), le nom des capacités (`structural_index`, `memory`, `dev_agent`, `review_agent`),
la table de routage elle-même.

Décisions ouvertes (à valider par Julien) :

- **DO1 — Sort des adaptateurs morts.** `codex.md`, `vibe.md` ne sont plus les défauts depuis
  le 2026-09-01 ; `gbrain.md` est déprécié depuis 0.9.0. Les droper à la fusion (c'est déjà un
  saut de version majeur) suppose qu'aucun projet actif ne les référence encore dans son
  `agent.yml` — à vérifier avant de trancher, pas à ce stade.
- **DO2 — Nom de la commande d'installation.** `aid kernel install` est le nom de travail de
  ce plan ; à aligner avec les conventions déjà prises pour `aid hooks install`, `aid mem
  reindex`, etc. au moment d'écrire 09.2.
- **DO3 — Devenir du dépôt `agent-kernel` lui-même.** Archivé (lecture seule, README pointant
  vers aidboard) ou simplement laissé sans nouveau commit après la fusion : à trancher en
  09.5, une fois le contenu effectivement rapatrié et vérifié en usage sur le canari.

## 5. Contrat

```
aidboard/
  kernel/
    adapters/*.md
    policy/*.md
    roles/*.md
    templates/instructions.tmpl.md
    commands/sync.md
    defaults.yml
    manifest.schema.yml
    agent.example.yml
    CHANGELOG.md          # sous-séquence : une entrée seulement quand kernel/ change
```

`package.json` → `files` inclut `kernel/` dans le tarball publié. Nouvelle commande CLI
(nom à confirmer, DO2) :

```
aid kernel install [--check]
```

- Matérialise `kernel/` vers `~/.agent-kernel` : copie les fichiers du package vers la cible,
  **retire** ceux qui ont disparu entre deux versions (comparaison par manifeste, pas un
  simple `cp -r` qui ne nettoierait jamais), installe `commands/sync.md` dans
  `~/.claude/commands/`. Idempotent, comme `bootstrap-machine.sh` aujourd'hui.
- `--check` : diagnostic seul, n'écrit rien — même convention que `bootstrap-machine.sh
  --check`.
- Jamais appelée automatiquement par `aid doctor` (DS9 du chantier 08 : le moteur ne
  s'installe pas tout seul, `aid doctor` constate et conseille). Une sonde `aid doctor`
  compare la version installée sur `~/.agent-kernel` à celle du package `aid` courant et
  recommande `aid kernel install` en cas d'écart — jamais ne le lance.

## 6. Points

### 09.1 — Rapatriement du contenu

Fichiers : création d'`aidboard/kernel/` ; déplacement verbatim d'`adapters/`, `policy/`,
`roles/`, `templates/`, `commands/`, `defaults.yml`, `manifest.schema.yml`,
`agent.example.yml` depuis `agent-kernel` (aucune réécriture de contenu, DS1) ;
`package.json` (`files`) pour que `kernel/` soit publié dans le tarball npm.

Tests : un `npm pack` (ou équivalent) liste `kernel/**` dans le tarball produit ; aucun test
existant d'aidboard ne régresse (le contenu est inerte du point de vue du daemon TypeScript).
Vérification : `npm run gate`.

### 09.2 — Commande `aid kernel install`

Fichiers : nouvelle commande CLI (`src/cli/commands/kernel.ts` ou équivalent selon l'arbre
`src/cli/commands/` existant), tests dédiés sur un `~/.agent-kernel` de fixture (jamais le
vrai `$HOME`, même piège que les tests `aid doctor`/`aid hooks`).

Tests : premier appel sur une cible absente → tous les fichiers écrits ; second appel sans
changement → rien ré-écrit (idempotent) ; un fichier retiré d'une nouvelle version du package
→ retiré de la cible au prochain appel ; `--check` → rien écrit, rapport seul.
Vérification : `npm run gate`.

### 09.3 — Version unique et `kernel/CHANGELOG.md`

Fichiers : `kernel/CHANGELOG.md` (nouveau, sous-séquence du changelog aidboard) ; `commands/
sync.md` §2 mis à jour pour lire ce fichier (au lieu du `CHANGELOG.md` racine d'agent-kernel)
et comparer `kernel.version` à la version d'aidboard installée (DS2) ; entrée de migration
explicite pour la transition elle-même (le saut depuis `0.9.0` vers la version d'aidboard au
moment de la fusion est la première migration majeure du nouveau système — § Pièges).

Tests : aucun côté daemon (contenu markdown) ; vérification manuelle du rendu `/sync` sur un
projet de fixture avec un `agent.yml` pinné à `0.9.0`.

### 09.4 — Bootstrap machine

Fichiers : `agent-kernel/scripts/bootstrap-machine.sh` migré vers `aidboard/scripts/`,
inversé (DS4) : installe Node/codegraph/Ollama comme aujourd'hui, installe `aid` par npm
(plus de clone+SHA d'aidboard), appelle `aid kernel install` à la place du clone du second
dépôt. `scripts/migrate-0.6-slugs.sh` et `migrate-0.9-memory.sh` : évalués pour abandon (déjà
appliqués partout) ou migration à l'identique si un poste n'a encore jamais tourné `/sync`
depuis leur sortie.

Tests : `--check` sur une machine neuve de fixture ne modifie rien et liste ce qui manque ;
un second passage après un premier complet est un no-op. Vérification : `npm run gate` +
exécution manuelle sur une VM/conteneur de test.

### 09.5 — Devenir du dépôt `agent-kernel`

Selon DO3 : archivage ou gel. Mise à jour du `README.md`/`SETUP.md` d'agent-kernel pour
pointer vers aidboard comme source de vérité, avant tout archivage effectif. Pas de
suppression de l'historique git.

### 09.6 — Documentation

Fichiers : `docs/chantiers/README.md` (ligne 09 dans le tableau §9) ; `aidboard/README.md`
racine (mention du module noyau) ; note de migration à destination des machines/projets déjà
rattachés (comment repasser de `~/.agent-kernel` en clone git à `aid kernel install` sans
casser un `agent.yml` déjà commité).

Pas de test ; vérification : `npm run gate` (lint markdown inclus s'il y en a un).

## 7. Pièges

- Ne jamais casser un bloc déjà rendu et commité (`<!-- agentkit:start VERSION --> …
  <!-- agentkit:end -->`) : le gabarit ne change pas de sens dans ce chantier, seulement son
  adresse de lecture.
- Un `agent.yml` existant peut épingler `kernel.version` en exact (`"0.9.0"`), pas en `main`.
  Après la fusion, `/sync` verra un saut de version potentiellement énorme (`0.9.0` → version
  d'aidboard courante) : il faut une entrée de migration explicite dans `kernel/CHANGELOG.md`
  pour ce saut précis, pas un historique vide qui laisserait `/sync` afficher un diff de
  version sans rien à montrer.
- `bootstrap-machine.sh` clone et épingle aidboard à un SHA aujourd'hui ; une fois migré dans
  aidboard, il ne peut plus s'installer en se clonant lui-même — il doit passer par
  `npm install -g aidboard@<version>`, jamais par un clone+checkout de son propre dépôt.
- Deux écrivains possibles sur `~/.agent-kernel` si une machine a encore l'ancien clone agent-
  kernel **et** lance `aid kernel install` : `aid doctor` doit le détecter (présence d'un
  `.git/` dans `~/.agent-kernel`) et avertir plutôt que fusionner silencieusement deux
  sources.
- Ne pas retirer `codex.md`/`vibe.md`/`gbrain.md` sans vérifier qu'aucun `agent.yml` actif ne
  les référence (DO1) — `/sync` les tolère aujourd'hui avec un avertissement, un retrait sec
  romprait le rendu pour qui les a encore déclarés.
- `aid kernel install` doit nettoyer les fichiers disparus entre deux versions du contenu
  (comparaison par manifeste), pas seulement copier : un simple `cp -r` laisserait les
  fichiers retirés d'une future version du noyau trainer indéfiniment sur chaque machine.

## 8. Fini quand

- Un poste neuf installe `aid` (npm) puis lance le bootstrap aidboard seul — plus besoin de
  cloner un second dépôt pour obtenir `~/.agent-kernel` et `/sync`.
- `aid kernel install` matérialise `kernel/` depuis le package installé, retire ce qui a
  disparu, et `--check` ne modifie jamais rien.
- `/sync` sur un projet déjà rattaché (manifeste et bloc déjà commités) continue de
  fonctionner sans intervention manuelle au-delà de ce qu'il fait déjà lui-même.
- `kernel.version` d'un projet reflète la version d'aidboard ; `kernel/CHANGELOG.md` ne liste
  que les changements réels du contenu du noyau, y compris l'entrée de migration de la fusion
  elle-même.
- Le dépôt `agent-kernel` n'est plus la source de vérité d'aucun contenu actif : toute
  évolution future de la politique, des rôles ou des adaptateurs se fait dans aidboard.
- `npm run gate` vert.
- README des chantiers §9 liste ce chantier.
