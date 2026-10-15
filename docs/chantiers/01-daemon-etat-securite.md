# 01 — Daemon : état, journal, sécurité

## Pourquoi

Tout le reste s'appuie sur un process unique qui détient l'état (§2), qui n'écoute que sur
`127.0.0.1` et qui refuse toute requête non authentifiée ou d'origine étrangère (§9), dont
l'état affiché dérive d'un journal append-only (§3, §4). La sécurité est livrée ici, avant
toute route qui lance un process.

## État actuel

Chantier 00 livré : toolchain, `src/cli/aid.ts` qui affiche la version.

## Cible

- `~/.aid/` (surchargeable par `AID_HOME`), config, verrou d'instance unique.
- Fastify sur `127.0.0.1:<port>`, authentification par token → cookie, contrôles `Host` /
  `Origin`, tokens de run à portée limitée.
- SQLite : schéma v1, migrations.
- Journal d'événements + projections dans la même transaction (D10).
- `GET /api/state`, `POST /api/events` (réservé aux tokens de run, sans émetteur en v0.1),
  `/ws/events` avec rejeu.
- Réconciliation au démarrage (D8).

Hors périmètre : workspaces, sujets (02), PTY (03).

## Décisions prises

- **`AID_HOME`** : toutes les fonctions qui touchent `~/.aid` prennent le chemin en
  paramètre ; seul `src/daemon/paths.ts` lit `process.env.AID_HOME ?? ~/.aid`. Les tests
  utilisent toujours un `AID_HOME` temporaire. Jamais le vrai `~/.aid` dans un test.
- Contenu de `~/.aid` :

```
config.yaml          optionnel, créé avec les défauts commentés au premier démarrage
state.db             (+ -wal, -shm)
daemon.json          { pid, port, token, startedAt }   0600, supprimé à l'arrêt propre
daemon.lock          pid                                0600
logs/<agentId>.log   0600
logs/actions/<actionId>.log
worktrees/<workspace>/<slug>/
spool/               (v0.2, créé vide)
```

  `~/.aid` et chaque sous-dossier en `0700`.

- **Config** (`src/daemon/config.ts`) :

```ts
export interface AidConfig {
  host: '127.0.0.1';            // toute autre valeur → refus de démarrer
  port: number;                 // défaut 4870 (D12)
  editor: string[];             // défaut : voir 04 ; "{path}" remplacé
  env: { strip: string[] };     // défaut ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'] (D9)
  terminal: { scrollback: number; logMaxBytes: number };  // 5000, 50 * 1024 * 1024
}
export function loadConfig(aidHome: string): AidConfig;   // fusion défauts < fichier ; erreur claire sur clé inconnue
```

- **Authentification** :
  - Au démarrage : `adminToken = randomBytes(32).toString('base64url')`, écrit dans
    `daemon.json`.
  - `GET /auth?token=<adminToken>` → comparaison `timingSafeEqual` → cookie
    `aid_session=<adminToken>; HttpOnly; SameSite=Strict; Path=/` → `303` vers `/`. Mauvais
    token → `401` page texte « Lien expiré : relancer `aid open` ».
  - Toute autre route (`/api/*`, `/ws/*`) exige le cookie **ou** un `Authorization: Bearer`.
    Les fichiers statiques de l'UI exigent le cookie aussi (sinon `401` texte).
  - **Tokens de run** : `runToken = randomBytes(24).toString('base64url')`, mémorisés en RAM
    `Map<token, runId>` (perdus au redémarrage, ce qui est voulu : les agents meurent avec le
    daemon). Ils n'ouvrent **que** `POST /api/events`, et seulement pour leur `runId` ;
    toute autre route → `403`.
- **Host / Origin** (hook `onRequest`, avant l'auth) :
  - `Host` ∈ { `127.0.0.1:<port>`, `localhost:<port>` }, sinon `421`.
  - `Origin`, s'il est présent, ∈ { `http://127.0.0.1:<port>`, `http://localhost:<port>` },
    sinon `403`.
  - Requêtes non-`GET` et toute montée WebSocket : `Origin` **obligatoire** pour les sessions
    cookie (un navigateur l'envoie toujours) ; absent → `403`. Les appels Bearer (CLI,
    `aid emit`) n'ont pas d'`Origin` et sont acceptés sans.
  - Aucun en-tête CORS, jamais.
  - Dev seulement : si `AID_DEV_ORIGIN` est défini (ex. `http://127.0.0.1:5173`, serveur
    Vite), cette origine est acceptée en plus. Jamais posée par défaut, et un avertissement
    est journalisé au démarrage quand elle l'est.
- En-têtes de réponse UI : `Content-Security-Policy: default-src 'self'; connect-src 'self'
  ws://127.0.0.1:<port> ws://localhost:<port>; style-src 'self' 'unsafe-inline'; img-src
  'self' data:; font-src 'self'` (xterm pose des attributs `style`), `X-Content-Type-Options:
  nosniff`, `Referrer-Policy: no-referrer`.

## Points

### 01.1 — Répertoire, config, chemins

Fichiers : `src/daemon/paths.ts`, `src/daemon/config.ts`, `test/config.test.ts`.

```ts
export interface AidPaths { home: string; db: string; daemonJson: string; lock: string;
  logs: string; actionLogs: string; worktrees: string; spool: string; config: string }
export function resolvePaths(home = process.env.AID_HOME ?? join(homedir(), '.aid')): AidPaths;
export function ensureHome(p: AidPaths): void;   // mkdir -p, chmod 0700 (y compris si existant)
```

Tests : défauts sans fichier ; fichier partiel fusionné ; `host: 0.0.0.0` → erreur
« A-I-D n'écoute que sur 127.0.0.1 » ; clé inconnue → erreur qui la nomme ; `ensureHome` pose
`0700` sur un dossier existant en `0755`.

Dépendance ajoutée : `yaml`.

### 01.2 — Instance unique, serveur, arrêt propre

Fichiers : `src/daemon/lock.ts`, `src/daemon/server.ts`, `src/daemon/main.ts`,
`test/lock.test.ts`, `test/server.test.ts`.

```ts
export function acquireLock(p: AidPaths): { release(): void };
// lock existant : pid vivant (process.kill(pid, 0)) → throw AidAlreadyRunning(pid)
//                 pid mort → on reprend le verrou (log « verrou périmé repris »)
export async function buildServer(deps: ServerDeps): Promise<FastifyInstance>;  // pas de listen
export async function startDaemon(opts: { home?: string; foreground: boolean }): Promise<void>;
```

`startDaemon` : `ensureHome` → `acquireLock` → `loadConfig` → `openDb` (01.4) →
`reconcile` (01.6) → `buildServer` → `listen({ host: '127.0.0.1', port })` → écrit
`daemon.json`. `EADDRINUSE` → message « port 4870 occupé : changer `port` dans
~/.aid/config.yaml » et sortie 1. `SIGINT`/`SIGTERM` → fermeture (03 y branchera l'arrêt des
PTY), suppression de `daemon.json`, libération du verrou.

Le CLI gagne la sous-commande `aid daemon --foreground` (le reste du CLI est en 05).

Dépendances : `fastify`, `@fastify/cookie`, `@fastify/static`, `@fastify/websocket`,
`@sinclair/typebox`.

Tests : deuxième `acquireLock` pendant que le premier tient → `AidAlreadyRunning` ; verrou
au pid mort repris ; le serveur écoute bien sur `127.0.0.1` (`server.addresses()`).

### 01.3 — Authentification et contrôles d'origine

Fichiers : `src/daemon/security.ts`, `test/securite.test.ts`.

```ts
export interface AuthState { adminToken: string; runTokens: Map<string, string /* runId */> }
export function registerSecurity(app: FastifyInstance, auth: AuthState, port: number): void;
export function issueRunToken(auth: AuthState, runId: string): string;
export function revokeRunTokens(auth: AuthState, runId: string): void;
// décore la requête : req.principal = { kind: 'admin' } | { kind: 'run', runId }
```

Tests (`app.inject` et un vrai client `ws` sur un port éphémère) — **c'est le critère
d'acceptation du brief, ne pas en retirer** :

| Cas | Attendu |
| --- | --- |
| `GET /api/state` sans cookie ni bearer | 401 |
| `GET /auth?token=bon` | 303 + `Set-Cookie` HttpOnly SameSite=Strict |
| `GET /auth?token=faux` | 401 |
| `GET /api/state` cookie valide, `Host: evil.com` | 421 |
| `POST /api/events` cookie valide, `Origin: http://evil.com` | 403 |
| `POST /api/topics` cookie valide, sans `Origin` | 403 |
| WebSocket `/ws/events` avec `Origin: http://evil.com` | refus de la montée |
| WebSocket `/ws/events` sans cookie | refus |
| Bearer run → `GET /api/state` | 403 |
| Bearer run → `POST /api/events` pour un autre `runId` | 403 |
| Bearer run → `POST /api/events` pour son `runId` | 202 |
| Réponse à `GET /` (cookie valide) | porte la CSP ci-dessus, aucun `Access-Control-*` |

### 01.4 — Schéma SQLite et migrations

Fichiers : `migrations/001_init.sql`, `src/daemon/db.ts`, `test/db.test.ts`.

```sql
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, root TEXT NOT NULL UNIQUE,
  base_branch TEXT NOT NULL, worktrees_dir TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE topics (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  slug TEXT NOT NULL, title TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('feat','fix','chore','spike')),
  branch TEXT NOT NULL, base TEXT NOT NULL, worktree TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('draft','active','review','merged','archived')),
  phase TEXT, index_state TEXT NOT NULL
    CHECK (index_state IN ('disabled','indexing','ready','failed')),
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
  UNIQUE (workspace_id, slug));
CREATE TABLE runs (
  id TEXT PRIMARY KEY, topic_id TEXT NOT NULL REFERENCES topics(id),
  mode TEXT NOT NULL CHECK (mode IN ('standard','swairm')),
  state TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE agents (
  id TEXT PRIMARY KEY, run_id TEXT NOT NULL REFERENCES runs(id),
  kind TEXT NOT NULL, role TEXT NOT NULL, transport TEXT NOT NULL, status TEXT NOT NULL,
  cwd TEXT NOT NULL, command TEXT NOT NULL /* JSON */, pid INTEGER, exit_code INTEGER,
  issue INTEGER, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE actions (
  id TEXT PRIMARY KEY, topic_id TEXT, workspace_id TEXT NOT NULL, action TEXT NOT NULL,
  state TEXT NOT NULL CHECK (state IN ('running','succeeded','needs_human','failed')),
  exit_code INTEGER, result TEXT /* JSON */, started_at TEXT NOT NULL, finished_at TEXT);
CREATE TABLE events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE, v INTEGER NOT NULL,
  ts TEXT NOT NULL, source TEXT NOT NULL, workspace_id TEXT, topic_id TEXT, run_id TEXT,
  agent_id TEXT, type TEXT NOT NULL, data TEXT NOT NULL /* JSON */);
CREATE INDEX events_topic ON events(topic_id, seq);
```

```ts
export function openDb(path: string): Database;  // WAL, foreign_keys=ON, busy_timeout=5000, migre
```

Migrations : fichiers `migrations/NNN_*.sql` appliqués dans l'ordre si
`NNN > PRAGMA user_version`, chacun dans une transaction, puis `user_version = NNN`.
`tsup` ne copie pas les `.sql` : les lire depuis `new URL('../../migrations/', import.meta.url)`
et ajouter `migrations/` à `files` de `package.json` (05).

Tests : base neuve → `user_version = 1` ; réouverture → pas de ré-application ; contrainte
`CHECK` sur `topics.state` refuse `'foo'`.

Dépendances : `better-sqlite3`, `@types/better-sqlite3`.

### 01.5 — Journal d'événements et projections

Fichiers : `src/shared/model.ts` (types du brief §3, recopiés tels quels), `src/shared/events.ts`,
`src/daemon/events/store.ts`, `src/daemon/events/projectors.ts`, `test/events.test.ts`.

```ts
// src/shared/events.ts
export type EventSource = 'hook:claude' | 'codex:json' | 'swairm' | 'github' | 'daemon'
  | 'action' | 'heuristic';
export type EventType = 'agent.spawned' | 'agent.exited' | 'agent.status' | 'agent.tool'
  | 'run.state' | 'run.command' | 'approval.requested' | 'approval.resolved'
  | 'files.changed' | 'cost' | 'action.started' | 'action.finished' | 'topic.state'
  | 'topic.phase';
export interface AidEvent<T = Record<string, unknown>> {
  v: 1; id: string; ts: string; source: EventSource; workspaceId?: string; topicId?: string;
  runId?: string; agentId?: string; type: EventType; data: T }

// src/daemon/events/store.ts
export class EventStore extends EventEmitter {           // émet 'event' (AidEvent & { seq })
  constructor(db: Database);
  append(e: Omit<AidEvent, 'v' | 'id' | 'ts'> & Partial<Pick<AidEvent, 'id' | 'ts'>>,
         mutate?: (tx: Database) => void): AidEvent & { seq: number };
  // une transaction : mutate(tx) (insertion des lignes neuves, ex. le topic) puis INSERT event
  // puis project(tx, event). INSERT OR IGNORE sur id : un id déjà vu → retourne l'existant,
  // n'émet rien (idempotence §4).
  since(afterId: string | null, filter?: { topicId?: string; runId?: string }): Array<AidEvent & { seq: number }>;
}
export function project(tx: Database, e: AidEvent): void;  // switch sur e.type
```

Projections v0.1 : `topic.state` → `topics.state`, `updated_at` ; `agent.spawned` → `agents.status
= 'starting'`, `pid` ; `agent.exited` → `status` (`done` si code 0, `error` sinon, `stopped`
si `data.reason ∈ {'user','daemon_restart'}`), `exit_code` ; `action.started` /
`action.finished` → table `actions` ; `run.state` → `runs.state`. Les autres types sont
stockés et non projetés.

`id` : `monotonicFactory()` de `ulid`, une seule instance par process.

Tests : idempotence (même `id` deux fois → une ligne, un seul `'event'`) ; ordre (`seq`
croissant même dans la même milliseconde) ; **reconstruction** : jouer 50 événements
mélangés, vider les projections, rejouer `project` sur tout le journal, comparer les tables
(D10) ; `mutate` qui lève → ni ligne neuve ni événement.

### 01.6 — État, ingestion, flux d'événements, réconciliation

Fichiers : `src/daemon/routes/state.ts`, `src/daemon/routes/events.ts`,
`src/daemon/ws/events.ts`, `src/daemon/reconcile.ts`, `test/state.test.ts`,
`test/ws-events.test.ts`, `test/reconcile.test.ts`.

```ts
// src/shared/state.ts
export interface StateSnapshot { lastEventId: string | null; workspaces: Workspace[];
  topics: Topic[]; runs: Run[]; agents: Agent[]; actions: ActionRun[] }
```

- `GET /api/state` → `StateSnapshot` (topics `archived` exclus par défaut, `?all=1` les inclut).
- `POST /api/events` → schéma TypeBox de `AidEvent` ; `runId` forcé à celui du token ; `202`.
  Aucun émetteur en v0.1 : la route existe pour que la sécurité soit testée dès maintenant.
- `/ws/events?since=<id>&topicId=&runId=` : envoie `since()` puis s'abonne à `'event'`.
  Pas de trou entre rejeu et direct : s'abonner **avant** de lire `since()`, mettre en file
  les événements reçus pendant le rejeu, ignorer ceux dont `seq ≤` dernier `seq` rejoué.
  Messages : `{ kind: 'event', event }`, et (02, 03) `{ kind: 'ephemeral', … }` non
  persistés.
- `reconcile(store)` : pour chaque agent `status ∈ ('starting','working','needs_input','idle')`
  → `agent.exited { reason: 'daemon_restart' }` ; chaque action `running` →
  `action.finished { exitCode: null, reason: 'daemon_restart' }` (état `failed`).

Tests : rejeu depuis un id puis direct sans trou ni doublon (500 événements émis pendant la
connexion) ; filtre `topicId` ; réconciliation.

## Pièges

- `better-sqlite3` est synchrone : ne jamais faire d'`await` à l'intérieur d'une
  transaction (`db.transaction(fn)` exige un `fn` synchrone).
- `@fastify/websocket` : la vérification d'`Origin` se fait dans le hook `onRequest` (avant
  la montée), pas dans le handler — sinon la connexion est déjà ouverte.
- `timingSafeEqual` lève si les longueurs diffèrent : comparer les longueurs d'abord.
- Le cookie ne doit pas porter `Secure` (HTTP local) sinon le navigateur l'ignore.
- `127.0.0.1` vs `localhost` : le cookie est lié à l'hôte. L'URL d'ouverture utilise toujours
  `127.0.0.1` (05) ; `localhost` reste accepté par `Host` pour qui le tape à la main, mais
  demandera une nouvelle authentification.

## Fini quand

- Tous les tests ci-dessus verts, `npm run gate` vert.
- `node dist/cli/aid.js daemon --foreground` démarre, `curl -s 127.0.0.1:4870/api/state` → 401,
  le lien de `~/.aid/daemon.json` ouvert dans un navigateur affiche la page vide de 00.
