import { expect, test } from 'vitest';
import {
  BoardBridge,
  type BridgeSnapshot,
  type BridgeStore,
  type CliResult,
  type ListedRow,
  parseOfferLine,
} from '../src/daemon/mesh/boardBridge.js';
import type { InboxDm } from '../src/daemon/mesh/inbox.js';

const CELL = 'fusion-test';
const SHA = 'a'.repeat(40);
const URL = 'https://github.com/BrainSurfing-tech/aidboard/pull/9';

function snapshotStore(initial?: BridgeSnapshot): BridgeStore & { snapshot: BridgeSnapshot } {
  const box = {
    snapshot: initial ?? { rows: {}, seen: [], journal: [] },
  };
  return {
    get snapshot() {
      return box.snapshot;
    },
    load: () => structuredClone(box.snapshot),
    save: (s) => {
      box.snapshot = structuredClone(s);
    },
  };
}

function offer(id: number, content: string, obligationId: string | null = null): InboxDm {
  return {
    id,
    threadId: null,
    from: 'lab-ovh',
    to: CELL,
    kind: 'question',
    content,
    createdAt: null,
    replyTo: null,
    obligationId,
  };
}

function row(over: Partial<ListedRow> = {}): ListedRow {
  return {
    id: 3392,
    status: 'open',
    step: 'build',
    holder: CELL,
    taken_at: null,
    state: 'offered (fusion-test)',
    accept_format: 'prose',
    accept: 'do the card',
    ...over,
  };
}

function harness(store = snapshotStore()) {
  const calls: string[][] = [];
  const rows = [row()];
  let projectId = 17;
  const topics = {
    created: 0,
    fail: false,
    state: 'draft',
    testOk: true,
    prOk: true,
    async create() {
      this.created += 1;
      if (this.fail) return { ok: false as const, error: 'create failed' };
      return { ok: true as const, id: 'tp_1', worktree: '/tmp/wt' };
    },
    async state() {
      return this.state;
    },
    async test() {
      return { ok: this.testOk };
    },
    async pr() {
      if (!this.prOk) return { ok: false as const };
      return { ok: true as const, url: URL, sha: SHA };
    },
  };
  const session = {
    prompts: [] as string[],
    started: 0,
    ended: 0,
    async start(req: { prompt: string }) {
      this.started += 1;
      this.prompts.push(req.prompt);
    },
    async end() {
      this.ended += 1;
    },
  };
  let gateOk = true;
  let gateCalls = 0;
  const files = new Map<string, string>();
  const cli = async (args: string[]): Promise<CliResult> => {
    calls.push(args);
    const text = args.join(' ');
    if (text.includes('obligations list')) {
      return { ok: true, stdout: JSON.stringify(rows), stderr: '' };
    }
    if (text.includes('cards show')) {
      return { ok: true, stdout: JSON.stringify({ id: 1359, project_id: projectId }), stderr: '' };
    }
    if (text.includes('obligations take')) {
      rows[0] = row({ ...rows[0], taken_at: 'T', state: 'open' });
      return { ok: true, stdout: '', stderr: '' };
    }
    if (text.includes('obligations close')) {
      rows[0] = row({ ...rows[0], status: 'closed', taken_at: 'T' });
      return { ok: true, stdout: '', stderr: '' };
    }
    return { ok: false, stdout: '', stderr: 'unexpected' };
  };
  const bridge = new BoardBridge({
    cell: CELL,
    cli,
    topics,
    session,
    store,
    gate: async () => {
      gateCalls += 1;
      return gateOk;
    },
    writeAccept: (path, text) => files.set(path, text),
  });
  return {
    bridge,
    calls,
    rows,
    topics,
    session,
    files,
    store,
    setProject: (id: number) => {
      projectId = id;
    },
    setGate: (ok: boolean) => {
      gateOk = ok;
    },
    get gateCalls() {
      return gateCalls;
    },
    takes: () => calls.filter((a) => a[2] === 'take'),
    closes: () => calls.filter((a) => a[2] === 'close'),
  };
}

const LINE = 'OFFERED — build on card 1359, obligation #3392';

test('parseOfferLine reads the card and ignores a question that is not an offer', () => {
  expect(parseOfferLine(LINE)).toEqual({ cardId: 1359, obligationId: 3392 });
  expect(parseOfferLine('question about card 1359')).toBeNull();
});

test('a question line is not a trigger even when obligation_id is set', async () => {
  const h = harness();
  await h.bridge.ingest(offer(1, 'please build card 1359', '3392'));
  expect(h.calls).toEqual([]);
  expect(h.topics.created).toBe(0);
});

test('duplicate offer creates one topic and takes once', async () => {
  const h = harness();
  await h.bridge.ingest(offer(1, LINE));
  h.topics.state = 'active';
  await h.bridge.ingest(offer(2, LINE));
  expect(h.topics.created).toBe(1);
  expect(h.takes()).toEqual([]);
  await h.bridge.acceptHuman(3392);
  expect(h.takes()).toHaveLength(1);
  expect(h.topics.created).toBe(1);
  await h.bridge.ingest(offer(3, LINE));
  expect(h.takes()).toHaveLength(1);
});

test('wrong project does not create or take', async () => {
  const h = harness();
  h.setProject(14);
  await h.bridge.ingest(offer(1, LINE));
  expect(h.topics.created).toBe(0);
  expect(h.takes()).toEqual([]);
});

test('wrong step does not create or take', async () => {
  const h = harness();
  h.rows[0] = row({ step: 'validate' });
  await h.bridge.ingest(offer(1, LINE));
  expect(h.topics.created).toBe(0);
  expect(h.takes()).toEqual([]);
});

test('failed topic create does not take', async () => {
  const h = harness();
  h.topics.fail = true;
  await h.bridge.ingest(offer(1, LINE));
  h.topics.state = 'active';
  await h.bridge.acceptHuman(3392);
  expect(h.topics.created).toBe(1);
  expect(h.takes()).toEqual([]);
});

test('lost take ack does not take a second time', async () => {
  const h = harness();
  h.calls.length = 0;
  const real = h.calls;
  let takeCalls = 0;
  const bridge = new BoardBridge({
    cell: CELL,
    store: h.store,
    topics: h.topics,
    session: h.session,
    writeAccept: (path, text) => h.files.set(path, text),
    cli: async (args) => {
      real.push(args);
      const text = args.join(' ');
      if (text.includes('obligations list')) {
        return { ok: true, stdout: JSON.stringify(h.rows), stderr: '' };
      }
      if (text.includes('cards show')) {
        return { ok: true, stdout: JSON.stringify({ id: 1359, project_id: 17 }), stderr: '' };
      }
      if (text.includes('obligations take')) {
        takeCalls += 1;
        h.rows[0] = row({ taken_at: 'T', state: 'open' });
        return { ok: false, stdout: '', stderr: 'ack lost' };
      }
      if (text.includes('obligations close')) {
        h.rows[0] = row({ status: 'closed', taken_at: 'T' });
        return { ok: true, stdout: '', stderr: '' };
      }
      return { ok: false, stdout: '', stderr: '' };
    },
  });
  await bridge.ingest(offer(1, LINE));
  h.topics.state = 'active';
  await bridge.acceptHuman(3392);
  await bridge.reconcile();
  expect(takeCalls).toBe(1);
});

test('restart reconciles the saved row and does not create again', async () => {
  const store = snapshotStore();
  const first = harness(store);
  await first.bridge.ingest(offer(1, LINE));
  expect(first.topics.created).toBe(1);
  first.topics.state = 'active';
  const second = harness(store);
  second.topics.created = first.topics.created;
  second.topics.state = 'active';
  // The saved row points at tp_1. The new bridge must not call create.
  const createdBefore = second.topics.created;
  await second.bridge.reconcile();
  expect(second.topics.created).toBe(createdBefore);
  expect(second.takes()).toEqual([]);
  await second.bridge.acceptHuman(3392);
  expect(second.takes()).toHaveLength(1);
});

test('lost close ack does not close a second time and ends the session', async () => {
  const h = harness();
  let closeCalls = 0;
  const bridge = new BoardBridge({
    cell: CELL,
    store: h.store,
    topics: h.topics,
    session: h.session,
    writeAccept: (path, text) => h.files.set(path, text),
    cli: async (args) => {
      h.calls.push(args);
      const text = args.join(' ');
      if (text.includes('obligations list')) {
        return { ok: true, stdout: JSON.stringify(h.rows), stderr: '' };
      }
      if (text.includes('cards show')) {
        return { ok: true, stdout: JSON.stringify({ id: 1359, project_id: 17 }), stderr: '' };
      }
      if (text.includes('obligations take')) {
        h.rows[0] = row({ taken_at: 'T' });
        return { ok: true, stdout: '', stderr: '' };
      }
      if (text.includes('obligations close')) {
        closeCalls += 1;
        h.rows[0] = row({ status: 'closed', taken_at: 'T' });
        return { ok: false, stdout: '', stderr: 'ack lost' };
      }
      return { ok: false, stdout: '', stderr: '' };
    },
  });
  await bridge.ingest(offer(1, LINE));
  h.topics.state = 'active';
  await bridge.acceptHuman(3392);
  await bridge.reconcile();
  expect(closeCalls).toBe(1);
  expect(h.session.ended).toBe(1);
  expect(h.session.prompts[0]).toContain('/tmp/wt/ACCEPT.md');
});

test('a released row is terminal even when state still says offered', async () => {
  const h = harness();
  h.rows[0] = row({ status: 'released', state: 'offered (fusion-test)', taken_at: null });
  await h.bridge.ingest(offer(1, LINE));
  h.topics.state = 'active';
  await h.bridge.acceptHuman(3392);
  expect(h.topics.created).toBe(0);
  expect(h.takes()).toEqual([]);
  expect(h.bridge.row(3392)?.phase).toBe('released');
});

test('autoTake stays off and a json accept closes with --evidence-json', async () => {
  const h = harness();
  h.rows[0] = row({ accept_format: 'json' });
  await h.bridge.ingest(offer(1, LINE));
  h.topics.state = 'active';
  await h.bridge.reconcile();
  expect(h.takes()).toEqual([]);
  await h.bridge.acceptHuman(3392);
  const close = h.closes()[0];
  expect(close).toBeDefined();
  const flag = close.indexOf('--evidence-json');
  expect(flag).toBeGreaterThan(0);
  const payload = JSON.parse(close[flag + 1]) as { all: string };
  expect(payload.all).toContain(URL);
  expect(payload.all).toContain(SHA);
  expect(h.calls.some((a) => a.includes('inbox') || a.includes('--token'))).toBe(false);
  expect(h.gateCalls).toBeGreaterThan(0);
  expect(h.session.started).toBe(1);
  expect(h.session.ended).toBe(1);
});

test('the gate blocks the close', async () => {
  const h = harness();
  h.setGate(false);
  await h.bridge.ingest(offer(1, LINE));
  h.topics.state = 'active';
  await h.bridge.acceptHuman(3392);
  expect(h.closes()).toEqual([]);
  expect(h.session.ended).toBe(0);
});
