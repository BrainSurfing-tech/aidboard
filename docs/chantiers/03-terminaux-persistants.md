# 03 — Terminaux persistants

Modèle exécutant recommandé : **complexe**. Ce chantier concentre les problèmes de
concurrence (écritures asynchrones, plusieurs clients, réponses automatiques du terminal).

## Pourquoi

Le critère central de la v0.1 : fermer l'onglet, le rouvrir, retrouver les agents vivants et
leurs terminaux intacts. Les agents (`claude`, `codex`) sont des interfaces plein écran :
rejouer des octets bruts tronqués ne suffit pas (D2).

## État actuel

Chantiers 01-02 livrés : `EventStore`, sécurité (`issueRunToken`), sujets avec `worktree` et
run implicite, `config.env.strip`, `config.terminal`.

## Cible

- `AgentManager` : lancer `claude`, `codex`, `shell` dans un PTY, cwd = worktree.
- Miroir *headless* par agent, instantané cohérent à la connexion (D2).
- `/ws/pty/:agentId` : plusieurs clients, un seul « propriétaire » de la saisie et de la
  taille (D3), protection contre les clients lents.
- Journal disque brut avec rotation.
- `POST /api/agents`, `DELETE /api/agents/:id`.
- Arrêt propre au `SIGTERM` du daemon ; réconciliation déjà faite en 01.6.

Hors périmètre : statuts fins, hooks, `aid emit`, reprise après redémarrage, agents
`headless` (`claude -p`), agents distants, contrôle de version gbrain (§6, v0.3).

## Décisions prises

- **Commandes** : `claude` → `['claude']` ; `codex` → `['codex']` ; `shell` →
  `[$SHELL ?? '/bin/bash', '-l']`. Le binaire est cherché dans le `PATH` du daemon avant
  le lancement ; absent → 422 « claude introuvable dans le PATH du daemon ». Aucun argument
  ajouté, aucune consigne injectée (§2).
- **Environnement** : `process.env` moins `config.env.strip` (D9), plus
  `TERM=xterm-256color`, `COLORTERM=truecolor`, `AID_URL=http://127.0.0.1:<port>`,
  `AID_TOKEN=<token du run>`, `AID_TOPIC`, `AID_RUN`, `AID_AGENT`. Un test vérifie
  l'absence d'`ANTHROPIC_API_KEY` **dans le process enfant** (pas seulement dans l'objet).
- **Statut v0.1** (D14) : `starting` au lancement, puis `done` / `error` / `stopped` à la
  sortie. Aucun autre.
- **Taille initiale** : 120 × 32 tant qu'aucun client n'a pris la main.
- **Propriétaire** (D3) : un seul client par agent. Seule sa saisie et ses
  redimensionnements atteignent le PTY. Un client devient propriétaire quand il envoie
  `{ t: 'claim' }` (l'UI l'envoie sur focus, frappe ou collage — jamais sur `onData`), ou
  s'il est le premier connecté. Les autres reçoivent `{ t: 'size' }` et affichent cette
  taille.
- **Réponses automatiques** : xterm.js répond seul à certaines requêtes du programme
  (position du curseur, attributs). Avec deux onglets, chacun répondrait. Comme seule la
  saisie du propriétaire passe, une seule réponse arrive. Le miroir *headless* du daemon
  **ne répond pas** (son `onData` n'est pas relié au PTY).
- **Protocole `/ws/pty/:agentId`** :

| Sens | Trame | Contenu |
| --- | --- | --- |
| serveur → client | texte | `{ t: 'hello', cols, rows, owner: boolean, status, replay: 'live' \| 'log' }` |
| serveur → client | binaire | sortie du terminal (UTF-8) : d'abord l'instantané, puis le direct |
| serveur → client | texte | `{ t: 'size', cols, rows }`, `{ t: 'owner', owner: boolean }`, `{ t: 'exit', exitCode, signal, reason }` |
| client → serveur | texte | `{ t: 'in', d: string }`, `{ t: 'resize', cols, rows }`, `{ t: 'claim' }` |

- **Client lent** : `ws.bufferedAmount > 4 Mio` → fermeture code `4001` (« client trop
  lent »). L'UI se reconnecte et reçoit un instantané. On ne met **jamais** le PTY en pause
  à cause d'un client.
- **Journal** : `logs/<agentId>.log`, `0600`, octets bruts. Au-delà de
  `config.terminal.logMaxBytes`, on renomme en `.log.1` (en écrasant l'ancien) et on rouvre.
- **Agent terminé** : son miroir reste en mémoire jusqu'à l'archivage du sujet. Après un
  redémarrage du daemon, il n'y a plus de miroir. On en reconstruit un depuis les 512 Kio
  de fin du journal, et `hello.replay = 'log'` : l'UI affiche « historique reconstruit
  depuis le journal, rendu approximatif » (repli déclaré).

## Points

### 03.1 — Lancer et arrêter un agent

Fichiers : `src/daemon/pty/spawn.ts`, `src/daemon/pty/manager.ts`, `src/daemon/pty/log.ts`,
`src/daemon/pty/preflight.ts`, `test/fixtures/fake-agent.sh`, `test/pty-spawn.test.ts`.

```ts
export function agentCommand(kind: 'claude' | 'codex' | 'shell', env: NodeJS.ProcessEnv): string[];
export function resolveOnPath(bin: string, pathVar: string): string | null;
export function agentEnv(base: NodeJS.ProcessEnv, strip: string[], aid: Record<`AID_${string}`, string>): NodeJS.ProcessEnv;

export class AgentManager {
  constructor(deps: { store: EventStore; db: Database; paths: AidPaths; config: AidConfig; auth: AuthState });
  spawn(o: { topicId: string; kind: 'claude' | 'codex' | 'shell' }): Agent;   // lève AidHttpError(422|409)
  stop(agentId: string, reason: 'user' | 'daemon_stop'): Promise<void>;     // SIGHUP, puis SIGKILL du groupe après 5 s
  stopAll(reason: 'daemon_stop', timeoutMs: number): Promise<void>;
  get(agentId: string): LiveAgent | undefined;
}

export function ptyPreflight(): void;
// 1. darwin : pour chaque node_modules/node-pty/prebuilds/darwin-*/spawn-helper (chemin résolu par
//    createRequire(import.meta.url).resolve('node-pty/package.json')), si non exécutable → chmod 0755 ;
//    EACCES → erreur « spawn-helper non exécutable : chmod +x <chemin> »
// 2. lance `/bin/sh -c 'exit 0'` dans un PTY ; échec → erreur qui cite le message natif
```

`spawn` : sujet `active` et worktree présent (sinon 409 « worktree introuvable ») →
`agentId` (ulid) → token du run (`issueRunToken`, un par run, réutilisé) → `pty.spawn(file,
args, { name: 'xterm-256color', cols: 120, rows: 32, cwd: worktree, env })` →
`append({ type: 'agent.spawned', source: 'daemon', … data: { kind, pid, command } }, mutate:
INSERT agents)`. `onExit` → `agent.exited { exitCode, signal, reason }`, où `reason` vaut
la raison d'arrêt mémorisée, sinon `'exit'`.

`ptyPreflight()` s'appelle dans `startDaemon` avant `listen`. Un échec empêche le démarrage.

`fake-agent.sh` : passe en écran alternatif (`\e[?1049h`), dessine un cadre et une ligne
`PRÊT`, relit l'entrée ligne par ligne et l'affiche (`> <ligne>`), sort sur `quit` (code 0)
ou `fail` (code 3), et revient de l'écran alternatif à la sortie.

Tests (vrais PTY) :
- `shell` lancé dans le worktree : `pwd` affiche le worktree ;
- `ANTHROPIC_API_KEY=x` dans l'environnement du daemon → `env | grep -c ANTHROPIC_API_KEY`
  dans le PTY affiche `0` ; les `AID_*` sont présents ;
- `quit` → `agent.exited` avec code 0 et statut `done` ; `fail` → `error` ;
- `stop(…, 'user')` sur un `sleep 300` → `stopped` en moins de 6 s ;
- `stopAll` → plus aucun process enfant (vérifier les pid par `process.kill(pid, 0)`) ;
- binaire absent du PATH → 422 ;
- journal : 2 Mio écrits avec `logMaxBytes = 1 Mio` → présence de `.log.1`, et `.log` sous
  1 Mio.

### 03.2 — Miroir et instantané cohérent

Fichiers : `src/daemon/pty/mirror.ts`, `test/pty-reconnect.test.ts`.

```ts
export class TerminalMirror {
  constructor(cols: number, rows: number, scrollback: number);
  write(data: string): void;
  resize(cols: number, rows: number): void;
  snapshotThen(cb: (snapshot: string) => void): void;
  dispose(): void;
  static fromLog(bytes: string, cols: number, rows: number, scrollback: number): TerminalMirror;
}
```

Implémentation de `snapshotThen` — **c'est le cœur du chantier** :

```
// xterm.write est asynchrone : serialize() ne voit que ce qui a déjà été analysé.
// La barrière write('', cb) est rappelée après TOUT ce qui a été écrit avant elle, et avant
// tout ce qui sera écrit après.
attach(client):
  client.pending = []            // sortie qui arrive pendant l'attente
  client.ready = false
  liveAgent.clients.add(client)  // dès maintenant, onData pousse dans client.pending
  mirror.term.write('', () => {
    snap = mirror.serialize.serialize({ scrollback })
    send(client, hello) ; send(client, snap)
    for chunk of client.pending : send(client, chunk)
    client.pending = null ; client.ready = true
  })
onData(chunk):                   // depuis le PTY
  log.write(chunk) ; mirror.write(chunk)
  for c of clients : c.ready ? send(c, chunk) : c.pending.push(chunk)
```

Les octets arrivés avant la barrière sont dans l'instantané. Ceux arrivés après sont dans
`pending`. Aucun n'est à la fois dans les deux.

`new Terminal({ cols, rows, scrollback, allowProposedApi: true })` de `@xterm/headless`,
avec `SerializeAddon` de `@xterm/addon-serialize`.

Tests :
- `fake-agent` en écran alternatif. On se connecte, on envoie `bonjour`, on se déconnecte,
  puis on se reconnecte : un `@xterm/headless` côté test qui reçoit l'instantané affiche le
  cadre, `PRÊT` et `> bonjour` aux mêmes positions que le miroir (comparer
  `buffer.active.getLine(i).translateToString()`) ;
- rafale : le PTY émet `seq 1 100000`. Pendant ce temps, un client se connecte puis se
  reconnecte dix fois. Le dernier client reconstruit **exactement** la fin du miroir, sans
  ligne en double ni manquante ;
- `fromLog` sur un journal coupé au milieu d'une séquence d'échappement : aucune exception.

Dépendances : `node-pty`, `@xterm/headless`, `@xterm/addon-serialize`.

### 03.3 — WebSocket PTY, propriétaire, clients lents

Fichiers : `src/daemon/ws/pty.ts`, `test/ws-pty.test.ts`.

- Route `/ws/pty/:agentId`. La sécurité vient de 01.3 (cookie et `Origin`). Un token de
  run est refusé, car un agent ne doit pas pouvoir lire ni piloter un autre terminal (§9).
- Messages du tableau « Protocole ». Les messages invalides sont ignorés et journalisés, sans
  couper la connexion.
- `resize` d'un client non propriétaire : ignoré. `resize` du propriétaire : `pty.resize`,
  `mirror.resize`, et `{ t: 'size' }` aux autres clients.
- Si le propriétaire se déconnecte, la propriété passe au client connecté le plus récent.
- Agent terminé : `hello` avec `status`, l'instantané, puis `{ t: 'exit' }`. Toute saisie
  est ignorée.

Tests : deux clients. Seul le propriétaire écrit dans le PTY : le texte de B n'apparaît pas
tant que B n'a pas envoyé `claim`. Après le `claim` de B, A reçoit `{ t: 'owner', owner:
false }` et `{ t: 'size' }`. Un client qui ne lit plus est coupé en `4001` (`bufferedAmount`
simulé par un client qui met son socket en pause) et le PTY continue. Un token de run est
refusé.

### 03.4 — Routes et arrêt du daemon

Fichiers : `src/daemon/routes/agents.ts`, modification de `src/daemon/main.ts` (seulement le
gestionnaire `SIGINT`/`SIGTERM` écrit en 01.2), `test/agents-routes.test.ts`.

- `POST /api/agents` `{ topicId, kind }` → 201 `Agent`.
- `DELETE /api/agents/:id` → 202. Agent déjà terminé → 409.
- Archivage d'un sujet (`topic.state` `archived`) → `dispose()` des miroirs de ses agents.
- Au `SIGTERM` du daemon : `stopAll('daemon_stop', 5000)`, puis fermeture du serveur.

Tests : cycle complet par HTTP et WebSocket. Le `SIGTERM` d'un daemon lancé en sous-process
laisse en base des agents `stopped` avec `reason: 'daemon_stop'`, et aucun process enfant
vivant.

## Pièges

- **Vitest et modules natifs** : `node-pty` dans les *worker threads* de Vitest plante de
  façon intermittente. Il faut `pool: 'forks'` dans `vitest.config.ts`, pour ces fichiers ou
  pour tous.
- `spawn-helper` livré en `0644` dans node-pty 1.1.0 (vérifié) : sans `ptyPreflight`, on
  obtient `posix_spawnp failed` sur macOS sans autre indice.
- node-pty décode la sortie en UTF-8 de façon incrémentale (`encoding: 'utf8'` par défaut) :
  ne pas repasser par des `Buffer` découpés soi-même, sous peine de couper un caractère
  multioctet.
- `serialize()` appelé directement, sans la barrière, réussit dans 99 % des tests et perd
  des octets sous charge. Le test « rafale » est là pour ça : ne pas l'affaiblir.
- Tuer seulement le pid du PTY laisse vivants les enfants de `claude` (serveurs MCP,
  `codegraph`). Le pid de node-pty est chef de session : il faut `process.kill(-pid, 'SIGKILL')`
  en dernier recours.
- Le premier lancement de `claude` ou de `codex` dans un worktree neuf affiche un dialogue
  de confiance. C'est normal, et A-I-D ne doit pas le contourner.

## Fini quand

- Tests verts (dont « rafale » et « reconnexion en écran alternatif »), `npm run gate` vert.
- À la main : un `claude` lancé par l'API reste utilisable après déconnexion et reconnexion
  d'un client `wscat`, et `ANTHROPIC_API_KEY` en est absente.
