# 04 — Interface v0.1

## Pourquoi

Julien doit voir ses sujets et piloter leurs terminaux depuis le navigateur (§10, point 5).
Les maquettes `design/maquettes/` sont la référence : on reprend leur structure
(`data-node`), leurs champs (`data-bind`), leurs intentions (`data-action`) et leur
feuille de style.

## État actuel

Chantiers 01-03 livrés : `GET /api/state`, `/ws/events`, `/ws/pty/:agentId`, routes
workspaces, topics, agents, actions. `web/` affiche `<p>A-I-D</p>` (00.2).

Maquettes (relevé du 2026-10-15) :
- Les trois fichiers ont **le même** bloc `<style>` (448 lignes, même empreinte SHA-1
  `7e146eb3…`).
- Pas de `@font-face` : `--font: 'Inter', sans-serif`.
- Les tailles sont fixées par `.cadre[data-viewport="phone|tablet|desktop|wide"]`, pas par des
  media queries (`maquette.css:128-131`).

## Cible

Écran 1.1 (Accueil) et écran 1.3 (Sujet), dans leur version v0.1, avec les états default,
empty, loading et error. Deux dialogues non maquettés (D13).

### Ce qu'on construit, ce qu'on omet

On ne rend pas les éléments hors v0.1 : ils ne sont ni désactivés ni grisés, ils sont
absents du DOM. Les maquettes demandent de « masquer en CSS sans retirer », mais cette règle
vaut pour les **tailles d'écran**, pas pour les jalons.

| Écran | Construit en v0.1 | Omis (jalon) |
| --- | --- | --- |
| Barre | `marque`, `nav-accueil`, `nouveau-sujet`, `daemon` | `nav-boite` (v0.2), `nav-consignes`, `nav-reglages`, `recherche`, `relais` (v0.5) |
| 1.1 entête | `titre`, `resume.sujets` | `resume.en-attente` (v0.2) |
| 1.1 filtres | `workspace-tous`, `workspace-N` | `statut-*` (v0.2) |
| 1.1 carte | `titre`, `workspace`, `branche`, `statut`, `agents`, `agent-N.type`/`.role`/`.statut`, `activite`, `actions.ouvrir` | `demande`, `message`, `terminal` (aperçu), `estime`, `execution`, `actions.pause`/`.pr`/`.agrandir`/`.reprendre-local` |
| 1.1 états | `vide.message`, `vide.creer`, `vide.aide` ; `grille.squelette-N` ; `erreur.bandeau` (daemon injoignable) ; `erreur.sujet-N` (worktree introuvable) avec `archiver` | `vide.issues` (v0.5), `erreur.sujet-N.recreer` (v0.3) |
| 1.1 légende | `statut-*` limités aux statuts v0.1 | `distant`, `estime` |
| 1.3 colonne | `sujets.groupe-N`, `sujet-N`, `.branche`, `.statut`, `squelette-N`, `indisponible` | — |
| 1.3 entête | `fil-ariane`, `titre`, `workspace`, `branche`, `base.branche`, `worktree`, `etat`, **`index`** (ajout, voir plus bas) | `base.retard` (v0.3), `run` (v0.4) |
| 1.3 terminaux | `onglets`, `onglet-N` (`type`, `role`, `statut`), `ajouter-agent`, `sortie` (xterm), `pied.persistance`, `pied.taille` | `demande` (v0.2), `partage` (v0.5) |
| 1.3 vide | `message`, `lancer-claude`, `lancer-codex`, `shell`, `aide` | `lancer-cursor` |
| 1.3 actions | `editeur`, `plus` → menu avec `topic.cleanup` | `sync`, `pr`, `tests` (v0.3) |
| 1.3 états | `erreur.bandeau` | `erreur.conflit` (v0.3) |
| 1.3 | — | `diff`, `consignes`, `fil` (v0.2 et suivantes) |
| 1.2 | — | tout l'écran (v0.2) |

## Décisions prises

- **CSS** : le bloc `<style>` des maquettes est recopié **à l'identique** dans
  `web/src/styles/maquette.css`. Les adaptations vont dans `web/src/styles/app.css`, chargé
  après. Un test compare l'empreinte de `maquette.css` à celle du bloc de
  `design/maquettes/aid-1-1-accueil.html` : si une maquette change, le test le signale.
- **Taille d'écran** : la racine `.cadre` reçoit `data-viewport`, calculé par
  `useViewport()` à partir de la largeur de la fenêtre : `< 640` → `phone`, `< 1180` →
  `tablet`, `< 1720` → `desktop`, sinon `wide`. On réutilise ainsi les règles des maquettes
  sans les réécrire. `app.css` remplace seulement la largeur fixe
  (`.cadre[data-viewport] { width: 100%; min-height: 100vh }`).
- **Police** : `@fontsource/inter`, servie en local. Aucune ressource externe (CSP de 01).
- **`data-node` conservés** dans le JSX, avec les mêmes noms et la même indexation : les e2e
  (05) s'en servent comme sélecteurs. Les `data-bind` et `data-action` sont conservés aussi.
- **Ajout `1-3.entete.index`** : il affiche l'état d'indexation (D6). Libellés :
  `disabled` → « index absent : lecture directe », `indexing` → « indexation en cours »,
  `ready` → « index prêt », `failed` → « index en échec : lecture directe ». L'élément suit
  le style de `entete.worktree`. **À montrer à Julien** : la maquette ne l'avait pas prévu.
- **Statuts v0.1** (D14) : `starting` → « Lancé · statut non suivi », anneau gris (la marque
  « En pause » de la légende, avec un autre libellé). `done` → « Terminé », `error` →
  « Erreur » (carré rouge), `stopped` → « Arrêté ». Le statut d'un sujet
  (`sujet.statut`) est le plus urgent de ses agents, dans cet ordre : `error` > `starting` >
  `stopped` > `done`.
- **Données** (D10) : `useAidState()` charge `GET /api/state`, ouvre `/ws/events?since=`,
  et relit `/api/state` (anti-rebond de 100 ms) à chaque `{ kind: 'event' }`. Les messages
  `ephemeral` (`action.output`) alimentent seulement le panneau de sortie d'action.
  L'UI ne calcule aucun état métier, à part le statut agrégé pour l'affichage.
- **Worktree introuvable** : on ajoute `worktreeMissing: boolean` à chaque topic de
  `GET /api/state` (`fs.existsSync`, côté daemon). C'est la seule modification du daemon
  dans ce chantier.
- **Arrêt d'un agent** : un menu par onglet (« Arrêter »), qui appelle `DELETE`. La maquette
  ne prévoit pas cet élément. Ajout `1-3.terminaux.onglet-N.arreter`, à montrer à Julien.
- **Routage** : `react-router`, avec `/` (1.1) et `/sujets/:topicId` (1.3).
- **Sécurité** : aucun `dangerouslySetInnerHTML` (règle ESLint de 00.2). Titres, branches et
  messages d'erreur passent toujours par du texte React.

## Points

### 04.1 — Styles, coque et barre

Fichiers : `web/src/styles/maquette.css`, `web/src/styles/app.css`,
`web/src/ui/useViewport.ts`, `web/src/ui/Shell.tsx`, `web/src/ui/Barre.tsx`,
`web/src/main.tsx`, `test/maquette-css.test.ts`.

Dépendances : `react-router`, `@fontsource/inter`.

Tests : empreinte de `maquette.css` ; `useViewport` aux quatre seuils (Vitest et jsdom ;
ajouter `@testing-library/react` et `jsdom` en dev).

### 04.2 — Couche de données

Fichiers : `web/src/data/api.ts`, `web/src/data/useAidState.ts`, `web/src/data/events.ts`,
`test/web/useAidState.test.ts`.

```ts
export async function api<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown): Promise<T>;
// credentials 'same-origin' ; 401 → throw SessionExpired ; 4xx → AidApiError { status, message }
export function useAidState(): {
  state: StateSnapshot | null; daemon: 'connecte' | 'reconnexion' | 'injoignable' | 'session-expiree';
  actionOutput(actionId: string): Array<{ stream: string; line: string }>;
};
```

Reconnexion du WebSocket : attente de 0,5, 1, 2, 4 puis 8 s (plafond). `daemon =
'injoignable'` après 3 échecs. Le `since` repart du dernier id reçu. `SessionExpired` →
écran plein « Session expirée : relancer `aid open` » (le token change à chaque démarrage du
daemon).

Tests : simulation de WebSocket et de `fetch`, avec relecture anti-rebond (10 événements en
50 ms → une seule relecture) et passage à `injoignable`.

### 04.3 — Écran 1.1 Accueil et dialogues

Fichiers : `web/src/ecrans/Accueil.tsx`, `web/src/ecrans/CarteSujet.tsx`,
`web/src/ui/Statut.tsx`, `web/src/dialogues/NouveauWorkspace.tsx`,
`web/src/dialogues/NouveauSujet.tsx`, `test/web/accueil.test.tsx`.

- Grille des sujets non archivés. Filtre par workspace.
- État `vide` : aucun sujet. Sans aucun workspace, `vide.creer` ouvre d'abord
  « Nouveau workspace ».
- « Nouveau workspace » : un champ chemin, une base facultative. Les erreurs 422 de 02.1 sont
  affichées telles quelles, ainsi que les `warnings`.
- « Nouveau sujet » : workspace, titre, type (`feat|fix|chore|spike`), et l'aperçu du slug
  et de la branche calculés avec `src/shared/slug.ts`. Pendant l'action, les lignes
  `action.output` défilent. En fin d'action : `succeeded` → navigation vers le sujet ;
  `needs_human` / `failed` → message et `tail`.
- `erreur.sujet-N` : `worktreeMissing` → « worktree introuvable », avec `archiver`
  (`topic.cleanup`).

Tests : rendu `vide`, `squelette` (state `null`) et bandeau `injoignable`. Un titre
`<img src=x onerror=alert(1)>` s'affiche littéralement (aucun élément `img` dans le DOM).
L'aperçu du slug est conforme à `slugify`.

### 04.4 — Écran 1.3 Sujet et terminaux

Fichiers : `web/src/ecrans/Sujet.tsx`, `web/src/terminal/Terminal.tsx`,
`web/src/terminal/ptySocket.ts`, `web/src/dialogues/ConfirmerNettoyage.tsx`,
`test/web/ptySocket.test.ts`.

Dépendances : `@xterm/xterm`, `@xterm/addon-fit`.

```ts
export class PtySocket {
  constructor(agentId: string, handlers: { onHello(h): void; onOutput(b: Uint8Array): void;
    onSize(c: number, r: number): void; onOwner(o: boolean): void; onExit(e): void });
  input(d: string): void; resize(c: number, r: number): void; claim(): void; close(): void;
}
```

Comportement de `Terminal.tsx` :
- Sur `hello` : `term.reset()`, puis on écrit la suite (instantané, puis direct). Si
  `replay === 'log'`, un bandeau affiche « historique reconstruit depuis le journal, rendu
  approximatif ».
- **Propriétaire** : `fit()` sur le conteneur, et `resize` au serveur si la taille change.
- **Non propriétaire** : `term.resize(cols, rows)` reçus, le conteneur défile, et
  `pied.taille` affiche « 120 × 32 · fixé par une autre vue ».
- `claim()` sur `focus`, `keydown` et `paste` du conteneur, **jamais** dans `term.onData`.
- `term.onData` → `input()` (le serveur ignore la saisie d'un non propriétaire).
- Fermeture `4001` → reconnexion immédiate. Autre fermeture → délais de 04.2.
- `pied.persistance` : « session conservée par le daemon ».

Menu `plus` → « Nettoyer le sujet ». Si l'action rend `needs_human` avec
`result.unmergedCommits = n`, le dialogue `ConfirmerNettoyage` affiche « n commit(s) seront
perdus » et un bouton qui renvoie `confirmUnmerged: n`. Si un agent est vivant (409), le
message demande d'arrêter les agents d'abord.

`ajouter-agent` et l'état `vide` : `lancer-claude`, `lancer-codex`, `shell` →
`POST /api/agents`. En cas de 422 (binaire absent), le message est affiché tel quel.

Le premier lancement de `claude` ou de `codex` dans un worktree neuf affiche son dialogue de
confiance. C'est normal : on le mentionne dans `vide.aide`.

Tests : `PtySocket` contre un faux serveur (ordre `hello` → instantané → direct) ; aucun
`claim` émis par `onData` ; `4001` → reconnexion sans délai.

## Pièges

- **Reformater `maquette.css`** (Prettier, ou un éditeur) casse le test d'empreinte. Le
  fichier va dans `.prettierignore`.
- `@xterm/addon-fit` dans un conteneur `display: none` (onglet inactif) calcule 0 × 0 et
  envoie `resize 0 0`, ce qui tue certains TUI. N'appeler `fit()` que si le conteneur est
  visible et non nul, et ignorer côté serveur tout `cols < 2` ou `rows < 2` (ajout permis
  dans `src/daemon/ws/pty.ts`).
- Une instance xterm par onglet, **montée une fois** et cachée en CSS au changement
  d'onglet : la démonter puis la remonter rejoue l'instantané à chaque clic.
- Le cookie est lié à `127.0.0.1` : en dev, Vite tourne sur un autre port. On ouvre donc
  `http://127.0.0.1:5173/auth?token=…`, et le proxy transmet le cookie. Le daemon doit
  être lancé avec `AID_DEV_ORIGIN=http://127.0.0.1:5173` (prévu en 01). Sans cette
  variable, toute écriture et toute montée WebSocket répondent 403 : c'est le comportement
  attendu.

## Fini quand

- Tests verts, `npm run gate` vert.
- Avec `npm run dev:daemon` et le build servi par le daemon : créer un workspace et trois
  sujets, lancer un `shell` dans chacun, changer d'onglet, fermer et rouvrir le navigateur,
  retrouver les terminaux intacts.
- Captures 390 px et 1440 px des écrans 1.1 et 1.3 jointes à la PR, à côté des cadres
  correspondants des maquettes.
