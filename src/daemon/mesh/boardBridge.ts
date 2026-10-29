import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { InboxDm } from './inbox.js';

/**
 * Pont board de la phase 2 (carte #1359, aidboard §3).
 * Les écritures passent par le CLI swarph, journalisées. autoTake est éteint :
 * un humain accepte dans l'inbox avant le take. `status released` est terminal,
 * même si `state` dit encore « offered ».
 */

export interface CliResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export interface TopicCreated {
  ok: true;
  id: string;
  worktree: string;
}

export interface TopicFailed {
  ok: false;
  error: string;
}

export interface TopicPort {
  create(cardId: number): Promise<TopicCreated | TopicFailed>;
  state(id: string): Promise<string>;
  test(id: string): Promise<{ ok: boolean }>;
  pr(id: string): Promise<{ ok: boolean; url?: string; sha?: string }>;
}

export interface SessionStart {
  cwd: string;
  acceptFile: string;
  prompt: string;
}

export interface SessionPort {
  start(req: SessionStart): Promise<void>;
  end(): Promise<void>;
}

export interface ListedRow {
  id: number;
  status: string;
  step?: string;
  holder?: string | null;
  taken_at?: string | null;
  state?: string;
  accept_format?: string | null;
  accept?: string | null;
}

export type Phase =
  | 'refused'
  | 'released'
  | 'failed-create'
  | 'awaiting-active'
  | 'awaiting-human'
  | 'taken'
  | 'closed';

export interface RowRecord {
  obligationId: number;
  cardId: number;
  phase: Phase;
  topicId?: string;
  worktree?: string;
  acceptFile?: string;
  prUrl?: string;
  sha?: string;
  takeSent?: boolean;
  closeSent?: boolean;
  humanAccepted?: boolean;
  sessionOpen?: boolean;
  tested?: boolean;
  gated?: boolean;
}

export interface JournalEntry {
  kind: 'take' | 'close';
  argv: string[];
}

export interface BridgeSnapshot {
  rows: Record<string, RowRecord>;
  seen: number[];
  journal: JournalEntry[];
}

export interface BridgeStore {
  load(): BridgeSnapshot;
  save(snapshot: BridgeSnapshot): void;
}

export interface BoardBridgeDeps {
  cell: string;
  projectId?: number;
  /** Dial du commandant. Éteint par défaut : pas de take sans acceptation humaine. */
  autoTake?: boolean;
  cli: (args: string[]) => Promise<CliResult>;
  topics: TopicPort;
  session: SessionPort;
  /** Porte A-I-D avant le close. */
  gate?: (topicId: string) => Promise<boolean>;
  store?: BridgeStore;
  writeAccept?: (path: string, text: string) => void;
}

const emptySnapshot = (): BridgeSnapshot => ({ rows: {}, seen: [], journal: [] });

export function fileStore(path: string): BridgeStore {
  return {
    load() {
      try {
        return JSON.parse(readFileSync(path, 'utf8')) as BridgeSnapshot;
      } catch {
        return emptySnapshot();
      }
    },
    save(snapshot) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, JSON.stringify(snapshot));
    },
  };
}

/** La ligne d'offre littérale. `obligation_id` du DM est ignoré : il est nul sur une offre de pair. */
export function parseOfferLine(
  content: string,
): { cardId: number; obligationId: number | null } | null {
  if (!/\bOFFERED\b/.test(content)) return null;
  const card = /\bcard #?(\d+)\b/i.exec(content);
  if (!card) return null;
  const named = /\bobligation #(\d+)\b/i.exec(content);
  return { cardId: Number(card[1]), obligationId: named ? Number(named[1]) : null };
}

function parseJsonValue(stdout: string): unknown {
  const arr = stdout.indexOf('[');
  const obj = stdout.indexOf('{');
  const at = arr >= 0 && (obj < 0 || arr < obj) ? arr : obj;
  if (at < 0) return null;
  try {
    return JSON.parse(stdout.slice(at));
  } catch {
    return null;
  }
}

export class BoardBridge {
  private readonly cell: string;
  private readonly projectId: number;
  private readonly autoTake: boolean;
  private readonly cli: BoardBridgeDeps['cli'];
  private topics: TopicPort;
  private session: SessionPort;
  private gate: (topicId: string) => Promise<boolean>;
  private readonly store: BridgeStore;
  private readonly writeAccept: (path: string, text: string) => void;
  private snapshot: BridgeSnapshot;
  private tail: Promise<void> = Promise.resolve();

  constructor(deps: BoardBridgeDeps) {
    this.cell = deps.cell;
    this.projectId = deps.projectId ?? 17;
    this.autoTake = deps.autoTake ?? false;
    this.cli = deps.cli;
    this.topics = deps.topics;
    this.session = deps.session;
    this.gate = deps.gate ?? (async () => true);
    this.store = deps.store ?? {
      load: emptySnapshot,
      save: () => undefined,
    };
    this.writeAccept =
      deps.writeAccept ??
      ((path, text) => {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, text);
      });
    this.snapshot = this.store.load();
  }

  get journal(): JournalEntry[] {
    return this.snapshot.journal;
  }

  row(obligationId: number): RowRecord | undefined {
    return this.snapshot.rows[String(obligationId)];
  }

  /** Le daemon branche topic.create / topic.test / topic.pr une fois les routes prêtes. */
  bind(parts: {
    topics?: TopicPort;
    session?: SessionPort;
    gate?: (topicId: string) => Promise<boolean>;
  }): void {
    if (parts.topics) this.topics = parts.topics;
    if (parts.session) this.session = parts.session;
    if (parts.gate) this.gate = parts.gate;
  }

  ingest(dm: InboxDm): Promise<void> {
    return this.enqueue(() => this.ingestOne(dm));
  }

  /** L'humain accepte dans l'inbox A-I-D. Sans ça, autoTake éteint ne prend pas la ligne. */
  acceptHuman(obligationId: number): Promise<void> {
    return this.enqueue(async () => {
      const rec = this.snapshot.rows[String(obligationId)];
      if (!rec) return;
      rec.humanAccepted = true;
      this.persist();
      await this.advance(rec);
    });
  }

  reconcile(): Promise<void> {
    return this.enqueue(async () => {
      for (const rec of Object.values(this.snapshot.rows)) await this.advance(rec);
    });
  }

  private enqueue(fn: () => Promise<void>): Promise<void> {
    const run = this.tail.then(fn, fn);
    this.tail = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private persist(): void {
    this.store.save(this.snapshot);
  }

  private async ingestOne(dm: InboxDm): Promise<void> {
    if (this.snapshot.seen.includes(dm.id)) return;
    const offer = parseOfferLine(dm.content);
    if (!offer) return;
    this.snapshot.seen.push(dm.id);
    this.persist();
    const rows = await this.list(offer.cardId);
    const projectOk = await this.projectIs(offer.cardId);
    const named =
      offer.obligationId === null ? null : rows.find((r) => r.id === offer.obligationId);
    const row =
      named ??
      (offer.obligationId === null
        ? rows.find((r) => r.status === 'open' && r.step === 'build' && r.holder === this.cell)
        : undefined);
    if (!projectOk || !row) {
      if (named && named.status === 'released') {
        this.rememberTerminal(named, offer.cardId, 'released');
      }
      return;
    }
    if (row.status === 'released') {
      this.rememberTerminal(row, offer.cardId, 'released');
      return;
    }
    if (!(row.status === 'open' && row.step === 'build' && row.holder === this.cell)) {
      this.rememberTerminal(row, offer.cardId, 'refused');
      return;
    }
    const existing = this.snapshot.rows[String(row.id)];
    if (existing) {
      await this.advance(existing);
      return;
    }
    const created = await this.topics.create(offer.cardId);
    if (!created.ok) {
      this.snapshot.rows[String(row.id)] = {
        obligationId: row.id,
        cardId: offer.cardId,
        phase: 'failed-create',
      };
      this.persist();
      return;
    }
    const rec: RowRecord = {
      obligationId: row.id,
      cardId: offer.cardId,
      phase: 'awaiting-active',
      topicId: created.id,
      worktree: created.worktree,
      acceptFile: `${created.worktree}/ACCEPT.md`,
    };
    this.snapshot.rows[String(row.id)] = rec;
    this.persist();
    await this.advance(rec);
  }

  private rememberTerminal(row: ListedRow, cardId: number, phase: 'released' | 'refused'): void {
    const prev = this.snapshot.rows[String(row.id)];
    const busy =
      prev &&
      (prev.phase === 'closed' || prev.phase === 'taken' || prev.phase === 'awaiting-human');
    if (busy) {
      return;
    }
    this.snapshot.rows[String(row.id)] = {
      obligationId: row.id,
      cardId,
      phase,
    };
    this.persist();
  }

  private async advance(rec: RowRecord): Promise<void> {
    if (
      rec.phase === 'closed' ||
      rec.phase === 'released' ||
      rec.phase === 'refused' ||
      rec.phase === 'failed-create'
    ) {
      return;
    }
    const fresh = await this.list(rec.cardId);
    const live = fresh.find((r) => r.id === rec.obligationId);
    if (live?.status === 'released') {
      rec.phase = 'released';
      this.persist();
      return;
    }
    if (live?.status === 'closed') {
      rec.phase = 'closed';
      if (rec.sessionOpen) {
        await this.session.end();
        rec.sessionOpen = false;
      }
      this.persist();
      return;
    }
    if (rec.phase === 'awaiting-active') {
      if (!rec.topicId) return;
      const state = await this.topics.state(rec.topicId);
      if (state !== 'active') return;
      rec.phase = 'awaiting-human';
      this.persist();
    }
    if (rec.phase === 'awaiting-human') {
      if (!this.autoTake && !rec.humanAccepted) return;
      if (live?.taken_at) {
        rec.phase = 'taken';
      } else if (rec.takeSent) {
        return;
      } else {
        const argv = ['board', 'obligations', 'take', String(rec.obligationId), '--as', this.cell];
        rec.takeSent = true;
        this.snapshot.journal.push({ kind: 'take', argv });
        this.persist();
        const took = await this.cli(argv);
        const after = await this.list(rec.cardId);
        const now = after.find((r) => r.id === rec.obligationId);
        if (now?.status === 'released') {
          rec.phase = 'released';
          this.persist();
          return;
        }
        if (!took.ok && !now?.taken_at) return;
        rec.phase = 'taken';
        this.persist();
      }
    }
    if (rec.phase !== 'taken' || !rec.topicId || !rec.worktree || !rec.acceptFile) return;
    if (!rec.sessionOpen) {
      const acceptText = live?.accept ?? `obligation #${rec.obligationId}`;
      this.writeAccept(rec.acceptFile, acceptText);
      const prompt = `The accept file is ${rec.acceptFile}`;
      await this.session.start({ cwd: rec.worktree, acceptFile: rec.acceptFile, prompt });
      rec.sessionOpen = true;
      this.persist();
    }
    if (!rec.tested) {
      const tested = await this.topics.test(rec.topicId);
      if (!tested.ok) return;
      rec.tested = true;
      this.persist();
    }
    if (!rec.prUrl || !rec.sha) {
      const opened = await this.topics.pr(rec.topicId);
      if (!opened.ok || !opened.url || !opened.sha) return;
      rec.prUrl = opened.url;
      rec.sha = opened.sha;
      this.persist();
    }
    if (!rec.gated) {
      const passed = await this.gate(rec.topicId);
      if (!passed) return;
      rec.gated = true;
      this.persist();
    }
    if (rec.closeSent) return;
    const format = live?.accept_format === 'json' ? 'json' : 'prose';
    const body = `${rec.prUrl}\n${rec.sha}`;
    const argv = [
      'board',
      'obligations',
      'close',
      String(rec.obligationId),
      '--as',
      this.cell,
      '--outcome',
      'pass',
    ];
    if (format === 'json') {
      argv.push('--evidence-json', JSON.stringify({ all: `${rec.prUrl} ${rec.sha}` }));
    } else {
      argv.push('--evidence', body);
    }
    rec.closeSent = true;
    this.snapshot.journal.push({ kind: 'close', argv });
    this.persist();
    const closed = await this.cli(argv);
    const after = await this.list(rec.cardId);
    const now = after.find((r) => r.id === rec.obligationId);
    if (!closed.ok && now?.status !== 'closed') return;
    rec.phase = 'closed';
    if (rec.sessionOpen) {
      await this.session.end();
      rec.sessionOpen = false;
    }
    this.persist();
  }

  private async list(cardId: number): Promise<ListedRow[]> {
    const res = await this.cli([
      'board',
      'obligations',
      'list',
      '--card',
      String(cardId),
      '--json',
      '--as',
      this.cell,
    ]);
    if (!res.ok) return [];
    const parsed = parseJsonValue(res.stdout);
    if (!Array.isArray(parsed)) return [];
    return parsed as ListedRow[];
  }

  private async projectIs(cardId: number): Promise<boolean> {
    const res = await this.cli([
      'board',
      'cards',
      'show',
      String(cardId),
      '--json',
      '--as',
      this.cell,
    ]);
    if (!res.ok) return false;
    const parsed = parseJsonValue(res.stdout);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false;
    return (parsed as { project_id?: unknown }).project_id === this.projectId;
  }
}
