import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type { StateSnapshot } from '../src/shared/state.js';
import { startTestDaemon, waitFor, type TestDaemon } from './helpers/daemon.js';
import { makeOriginAndClone } from './helpers/git.js';

let t: TestDaemon;
afterEach(async () => {
  delete process.env.AID_GH_BIN;
  delete process.env.FAKE_GH_UNAUTHENTICATED;
  delete process.env.FAKE_GH_PR_NUMBER;
  delete process.env.FAKE_GH_PR_URL;
  await t?.d.stop();
});

const tmp = () => realpathSync(mkdtempSync(join(tmpdir(), 'aid-tp-')));
const FAKE_CODEGRAPH = join(import.meta.dirname, 'fixtures/fake-codegraph.sh');
const FAKE_GH = join(import.meta.dirname, 'fixtures/fake-gh.sh');

async function setup() {
  process.env.AID_GH_BIN = FAKE_GH;
  t = await startTestDaemon(undefined, { codegraphBin: FAKE_CODEGRAPH });
  const repo = makeOriginAndClone(tmp());
  const ws = (
    await t.d.app.inject({
      method: 'POST',
      url: '/api/workspaces',
      headers: t.headers,
      payload: { path: repo.clone },
    })
  ).json<{ id: string; worktreesDir: string }>();
  return { ...repo, ws };
}

const finished = (actionId: string) =>
  waitFor(
    () =>
      t.store.since(null).find((e) => e.type === 'action.finished' && e.data.actionId === actionId),
    15_000,
    `fin de ${actionId}`,
  );

const state = async () =>
  (await t.d.app.inject({ url: '/api/state', headers: t.headers })).json<StateSnapshot>();

const pr = (topicId: string, payload: Record<string, unknown> = {}) =>
  t.d.app.inject({
    method: 'POST',
    url: `/api/topics/${topicId}/actions/topic.pr`,
    headers: t.headers,
    payload,
  });

test('topic.pr : ouvre la PR, le sujet passe en review avec son numéro et son url', async () => {
  const { ws } = await setup();
  const created = (
    await t.d.app.inject({
      method: 'POST',
      url: '/api/topics',
      headers: t.headers,
      payload: { workspaceId: ws.id, title: 'PR', type: 'feat' },
    })
  ).json<{ actionId: string }>();
  await finished(created.actionId);
  const topicId = (await state()).topics[0]?.id;
  if (!topicId) throw new Error('sujet manquant');

  process.env.FAKE_GH_PR_NUMBER = '42';
  process.env.FAKE_GH_PR_URL = 'https://github.com/test/test/pull/42';
  const r = await pr(topicId, { title: 'Ma PR', body: 'description' });
  expect(r.statusCode).toBe(202);
  const fin = await finished(r.json<{ actionId: string }>().actionId);
  expect(fin.data.outcome).toBe('succeeded');

  expect((await state()).topics).toMatchObject([
    { state: 'review', prNumber: 42, prUrl: 'https://github.com/test/test/pull/42' },
  ]);
});

test('topic.pr : gh non authentifié, needs_human', async () => {
  const { ws } = await setup();
  const created = (
    await t.d.app.inject({
      method: 'POST',
      url: '/api/topics',
      headers: t.headers,
      payload: { workspaceId: ws.id, title: 'Sans gh', type: 'feat' },
    })
  ).json<{ actionId: string }>();
  await finished(created.actionId);
  const topicId = (await state()).topics[0]?.id;
  if (!topicId) throw new Error('sujet manquant');

  process.env.FAKE_GH_UNAUTHENTICATED = '1';
  const r = await pr(topicId, { title: 'Ma PR' });
  const fin = await finished(r.json<{ actionId: string }>().actionId);
  expect(fin.data).toMatchObject({ outcome: 'needs_human', exitCode: 2 });
  expect((fin.data.tail as string[]).join(' ')).toContain('non authentifié');
  expect((await state()).topics).toMatchObject([{ state: 'active', prNumber: null }]);
});

test('topic.pr : titre manquant, 422', async () => {
  const { ws } = await setup();
  const created = (
    await t.d.app.inject({
      method: 'POST',
      url: '/api/topics',
      headers: t.headers,
      payload: { workspaceId: ws.id, title: 'Sans titre', type: 'feat' },
    })
  ).json<{ actionId: string }>();
  await finished(created.actionId);
  const topicId = (await state()).topics[0]?.id;
  if (!topicId) throw new Error('sujet manquant');
  expect((await pr(topicId, {})).statusCode).toBe(422);
});

test('topic.pr : worktree manquant (brouillon), 409', async () => {
  const { ws } = await setup();
  const created = (
    await t.d.app.inject({
      method: 'POST',
      url: '/api/topics',
      headers: t.headers,
      payload: { workspaceId: ws.id, title: 'Draft', type: 'feat' },
    })
  ).json<{ actionId: string }>();
  const topicId = (await state()).topics[0]?.id;
  if (!topicId) throw new Error('sujet manquant');
  expect((await pr(topicId, { title: 'x' })).statusCode).toBe(409);
  await finished(created.actionId);
});
