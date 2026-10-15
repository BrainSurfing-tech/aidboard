# 05 — CLI, distribution et recette

## Pourquoi

A-I-D se lance par une commande (§2 « Distribution ») et doit être prouvé sur macOS et sous
WSL2 (§10). Trois obstacles sont connus d'avance : le nom npm (D1), la compilation de
node-pty sous Linux (D5) et l'ouverture du navigateur Windows depuis WSL2.

## État actuel

Chantiers 00-04 livrés. `aid daemon --foreground` existe (01.2) ; `startDaemon` écrit
`~/.aid/daemon.json` `{ pid, port, token, startedAt }` ; `ptyPreflight()` (03.1).

## Cible

- CLI : `aid`, `aid open`, `aid status`, `aid stop [--force]`, `aid doctor`,
  `aid daemon --foreground`.
- Paquet `aidboard` qui s'installe et tourne depuis son tarball (`npm pack`).
- e2e Playwright des critères d'acceptation.
- Recette manuelle macOS et WSL2, consignée dans la PR.
- `README.md` utilisateur.

Hors périmètre : la publication sur le registre npm (action visible de tous : elle attend
l'accord de Julien), le démarrage automatique (launchd, systemd), `aid emit` (v0.2).

## Décisions prises

- **`aid` sans argument** : si le daemon ne répond pas, le lancer détaché, attendre
  `daemon.json` puis un `GET /api/state` réussi (délai de 10 s), puis faire comme
  `aid open`.
- **Lancement détaché** : `spawn(process.execPath, [cliPath, 'daemon'], { detached: true,
  stdio: ['ignore', fd, fd] }).unref()`, où `fd` désigne `~/.aid/daemon.log`, ouvert en ajout
  avec les droits `0600`.
- **Le CLI parle au daemon** avec `Authorization: Bearer <token>` lu dans `daemon.json`. Ce
  sont des appels sans `Origin`, acceptés pour un Bearer (01.3).
- **`aid stop`** appelle `POST /api/daemon/stop` `{ force?: boolean }`. S'il reste des
  agents vivants et que `force` n'est pas posé, la réponse est 409 avec leur liste (D8).
  Sinon, même chemin que `SIGTERM`.
- **Ouverture du navigateur**, toujours sur `http://127.0.0.1:<port>/auth?token=…` (jamais
  `localhost`, qui peut se résoudre en `::1` côté Windows) :
  - darwin : `open <url>` ;
  - WSL (`/proc/version` contient `microsoft`) : `wslview <url>` si présent, sinon
    `cmd.exe /c start "" "<url>"` ;
  - autre Linux : `xdg-open <url>` ;
  - en cas d'échec : afficher l'URL et dire de l'ouvrir à la main.

  L'URL est aussi toujours affichée dans le terminal.
- **Scripts git** : appelés par `bash <fichier>`, leur bit d'exécution n'a donc pas
  d'importance une fois empaquetés.
- `package.json` : `"files": ["dist", "migrations", "scripts/git", "README.md"]`.
  `private` passe à `false` seulement si Julien valide la publication.

## Points

### 05.1 — CLI

Fichiers : `src/cli/aid.ts`, `src/cli/commands/*.ts`, `src/cli/browser.ts`,
`src/daemon/routes/daemon.ts`, `test/cli.test.ts`, `test/browser.test.ts`.

```ts
export function browserCommand(o: { platform: NodeJS.Platform; procVersion: string | null;
  has(bin: string): boolean; url: string }): string[] | null;
```

Analyse des arguments avec `node:util` `parseArgs`, sans dépendance. Codes de sortie :
`0` en cas de succès, `1` en cas d'erreur, `2` pour `stop` refusé à cause d'agents vivants.

`aid status` affiche : pid, port, uptime, nombre de sujets actifs et d'agents vivants. Si le
daemon est absent, il affiche « daemon arrêté » et sort en 0.

Tests :
- `browserCommand` dans les quatre cas (avec `procVersion` injecté) ;
- cycle complet dans un sous-process avec `AID_HOME` temporaire et un port libre : `aid`
  (avec ouverture du navigateur neutralisée par `AID_NO_BROWSER=1`), `aid status`, un agent
  `shell` lancé par l'API, `aid stop` → 2, `aid stop --force` → 0, plus aucun process ;
- un `daemon.json` resté d'un daemon mort (pid invalide) → `aid` relance proprement.

### 05.2 — `aid doctor`, paquet, README

Fichiers : `src/cli/commands/doctor.ts`, `README.md`, `package.json` (`files`, `engines`),
`test/doctor.test.ts`, `test/pack.test.ts`.

`aid doctor` affiche une ligne par contrôle, `✓`, `⚠` ou `✗`, et sort en 1 si un `✗` :

| Contrôle | ✗ si | ⚠ si |
| --- | --- | --- |
| Node | hors de `engines` | — |
| `node-pty` chargeable et `ptyPreflight()` | échec, avec un message adapté à la plateforme : sous Linux, `sudo apt install build-essential python3` puis réinstallation | — |
| `better-sqlite3` chargeable | échec | — |
| `git` | absent | version < 2.38 |
| `bash` | absent | — |
| `claude`, `codex` | — | absent (l'agent correspondant sera refusé) |
| `codegraph` | — | absent (sujets sans index) |
| `gh` | — | absent (requis à partir de la v0.3) |
| Droits de `~/.aid` | ≠ `0700` | — |
| Port | occupé par autre chose qu'A-I-D | — |
| WSL | — | `wslview` absent ; workspaces sous `/mnt/` |

`README.md` (pour l'utilisateur) : ce qu'est A-I-D, prérequis par plateforme (WSL2 :
`build-essential`, `python3`, `wslu`), installation (`npm i -g aidboard` ou `npx aidboard`, ou depuis le
tarball tant que rien n'est publié), `aid` / `aid stop`, le modèle de sécurité en cinq lignes
(127.0.0.1, token, cookie, origine, aucun code ne sort de la machine), où sont les données
(`~/.aid`), et le dialogue de confiance de `claude` au premier lancement.

`test/pack.test.ts` (lent, étiqueté `pack`, inclus dans `gate:e2e` et pas dans `gate`) :
`npm pack` → `npm i <tgz>` dans un dossier temporaire → `npx aidboard doctor` → sortie 0 sur le
poste de dev.

### 05.3 — e2e des critères d'acceptation

Fichiers : `playwright.config.ts`, `e2e/global-setup.ts`, `e2e/helpers.ts`,
`e2e/trois-sujets.spec.ts`, `e2e/reconnexion.spec.ts`, `e2e/repli-index.spec.ts`,
`e2e/cleanup.spec.ts`. Le test sauté de 00.3 est supprimé.

- `global-setup` : `AID_HOME` temporaire, port 4871, `AID_NO_BROWSER=1`, lancement de `aid`,
  lecture du token dans `daemon.json`, un dépôt `origin` et son clone créés par
  `test/helpers/git.ts`, enregistrement du workspace par l'API.
- Sélecteurs : **uniquement** des `data-node` (`[data-node="1-1.grille.sujet-1"]`).
- `trois-sujets` : créer trois sujets par l'UI, lancer un `shell` dans chacun, taper
  `echo marqueur-<n>` dans chacun, vérifier les trois sorties et trois worktrees distincts
  (`pwd`).
- `reconnexion` : lancer un `shell`, taper `echo avant; (sleep 2; echo pendant) &`,
  **fermer le contexte navigateur** aussitôt, attendre 3 s, ouvrir un nouveau contexte,
  s'authentifier, ouvrir le sujet. `avant` et `pendant` sont visibles (`pendant` a été
  produit alors qu'aucun client n'était connecté), et l'agent est toujours vivant dans
  `/api/state`.
- `repli-index` : workspace sans `.codegraph/` → `1-3.entete.index` affiche « index absent :
  lecture directe ».
- `cleanup` : créer un fichier non commité dans le worktree → « Nettoyer le sujet » →
  message de refus, sujet toujours présent.

Les tests lisent le contenu du terminal par `page.evaluate` sur le buffer xterm exposé en dev
(`window.__aidTerminals[agentId].buffer`). Cette exposition n'existe que si
`import.meta.env.DEV` ou `AID_E2E=1` : **jamais** dans le build publié.

### 05.4 — Recette manuelle

Pas de code. Grille à recopier dans la description de la PR, cochée sur **les deux**
postes. Elle utilise le vrai `claude` (abonnement, sans clé API dans l'environnement :
contrôler dans chaque session avec `/status` que la connexion se fait par l'abonnement).

```
Poste : [ ] macOS (M5)  [ ] Windows + WSL2 (tour)
[ ] Installation depuis le tarball : `npm i -g ./aidboard-0.1.0.tgz` sans erreur
    (WSL2 : après `sudo apt install build-essential python3 wslu`)
[ ] `aid doctor` : aucun ✗
[ ] `aid` ouvre le navigateur sur 127.0.0.1 et la page s'affiche (WSL2 : navigateur Windows)
[ ] Enregistrer un vrai repo (WSL2 : sous ~/, pas /mnt/c)
[ ] Trois sujets, une session Claude dans chacun, chacun dans son worktree (`pwd` dans Claude)
[ ] `/status` dans Claude : abonnement, pas de clé API
[ ] Fermer l'onglet, attendre 1 min, `aid open` : les trois Claude tournent, l'historique est intact
[ ] Deux vues (poste + second onglet étroit) : la taille suit la vue qui a la main
[ ] Nettoyer un sujet avec un fichier modifié : refusé ; avec un commit non poussé : confirmation demandée
[ ] Sujet sans index : « index absent : lecture directe »
[ ] `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4870/api/state` → 401
[ ] `curl -H 'Origin: http://evil.com' -b 'aid_session=<token>' -X POST …/api/topics` → 403
[ ] `ss -ltn` / `lsof -iTCP -sTCP:LISTEN` : 4870 écoute uniquement sur 127.0.0.1
[ ] `aid stop` refuse tant que des agents vivent ; `aid stop --force` arrête tout, aucun process orphelin (`ps`)
```

## Pièges

- `cmd.exe /c start` interprète `&` : l'URL d'authentification n'en contient pas (un token
  en base64url n'en a pas). Ne jamais y ajouter un second paramètre.
- `npx` sous WSL2 sans chaîne de compilation : l'erreur de node-gyp est longue et ne cite
  pas node-pty en premier. Le README le dit en tête des prérequis.
- `detached: true` sans `unref()` : le CLI ne rend jamais la main.
- Avec Playwright, fermer **la page** ne suffit pas, puisque le contexte garde le cookie et
  le cache. Il faut fermer le **contexte**.

## Fini quand

- `npm run gate` et `npm run gate:e2e` verts sous Node 22 et sous Node 24.
- Grille 05.4 cochée sur macOS **et** sur WSL2, jointe à la PR.
- Les six critères d'acceptation du §10 sont reliés à leur preuve (README des chantiers, §4).
