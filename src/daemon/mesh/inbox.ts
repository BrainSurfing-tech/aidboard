import { type FSWatcher, existsSync, readFileSync, watch } from 'node:fs';
import { dirname } from 'node:path';

/** Un DM tel que `mesh.dm` le transporte (12.1) : les noms d'`inbox.log` traduits en camelCase. */
export interface InboxDm {
  id: number;
  threadId: string | null;
  from: string;
  to: string;
  kind: string;
  content: string;
  createdAt: string | null;
  replyTo: number | null;
  obligationId: string | null;
}

export interface InboxFollowerDeps {
  file: string;
  /** plus grand id déjà projeté, lu en base au démarrage (12.3 : jamais un offset d'octets) */
  cursor: number;
  onDm: (dm: InboxDm) => void;
  log: (line: string) => void;
  /** repli quand fs.watch ne dit rien (défaut 5 s) */
  pollMs?: number;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const int = (v: unknown): number | null => (Number.isInteger(v) ? (v as number) : null);

/** Une ligne d'`inbox.log` (JSONL écrit par `swarph monitor`) ; null si elle n'est pas un DM lisible. */
export function parseInboxLine(line: string): InboxDm | null {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const id = int(r.id);
  if (id === null) return null;
  return {
    id,
    threadId: str(r.thread_id),
    from: str(r.from_node) ?? '',
    to: str(r.to_node) ?? '',
    kind: str(r.kind) ?? '',
    content: str(r.content) ?? '',
    createdAt: str(r.created_at),
    replyTo: int(r.reply_to),
    obligationId: str(r.obligation_id),
  };
}

/**
 * Suit `<state>/<cell>/mesh-sidecar/inbox.log` (D35). Le curseur est le plus grand `id` déjà vu : le
 * fichier peut être réécrit par un autre outil swarph, un offset rejouerait ou sauterait des DM. Les
 * lignes invalides sont comptées, pas levées. Un seul lecteur de plus : le monitor, `mesh wait` et le
 * plugin channel lisent le même fichier sans se gêner.
 */
export class InboxFollower {
  private last: number;
  private watcher: FSWatcher | null = null;
  private timer: NodeJS.Timeout | null = null;
  private ticking = false;
  private invalidSeen = 0;

  constructor(private readonly deps: InboxFollowerDeps) {
    this.last = deps.cursor;
  }

  get cursor(): number {
    return this.last;
  }

  start(): void {
    if (this.timer) return;
    this.tick();
    this.timer = setInterval(() => this.tick(), this.deps.pollMs ?? 5000);
    this.timer.unref();
    // le dossier plutôt que le fichier : il peut ne pas exister encore, ou être remplacé
    const dir = dirname(this.deps.file);
    try {
      if (existsSync(dir)) {
        this.watcher = watch(dir, () => this.tick());
        this.watcher.on('error', () => undefined);
        this.watcher.unref();
      }
    } catch {
      this.watcher = null;
    }
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.watcher?.close();
    this.watcher = null;
  }

  /** Lit tout le fichier et émet les DM d'id supérieur au curseur, par id croissant. Rend leur nombre. */
  tick(): number {
    if (this.ticking) return 0;
    this.ticking = true;
    try {
      let text: string;
      try {
        text = readFileSync(this.deps.file, 'utf8');
      } catch {
        return 0;
      }
      const fresh: InboxDm[] = [];
      let invalid = 0;
      for (const line of text.split('\n')) {
        if (line.trim() === '') continue;
        const dm = parseInboxLine(line);
        if (!dm) invalid++;
        else if (dm.id > this.last) fresh.push(dm);
      }
      if (invalid !== this.invalidSeen) {
        this.deps.log(`mesh : ${invalid} ligne(s) illisible(s) dans ${this.deps.file}`);
        this.invalidSeen = invalid;
      }
      fresh.sort((a, b) => a.id - b.id);
      for (const dm of fresh) {
        this.deps.onDm(dm);
        this.last = dm.id;
      }
      return fresh.length;
    } finally {
      this.ticking = false;
    }
  }
}
