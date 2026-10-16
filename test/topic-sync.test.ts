import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { gitLiveInfo } from '../src/daemon/git/inspect.js';
import type { StateSnapshot } from '../src/shared/state.js';
import { startTestDaemon, waitFor, type TestDaemon } from './helpers/daemon.js';
import { commitFile, makeOriginAndClone, sh } from './helpers/git.js';

let t: TestDaemon;
afterEach(async () => {
  await t?.d.stop();
});

const tmp = () => realpathSync(mkdtempSync(join(tmpdir(), 'aid-ts-')));
const FAKE = join(import.meta.dirname, 'fixtures/fake-codegraph.sh');

async function setup() {
  t = await startTestDaemon(undefined, { codegraphBin: FAKE });
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

test('topic.sync : rebase sans conflit, avance/retard lus en direct avant et après', async () => {
  const { origin, clone, ws } = await setup();
  const created = (
    await t.d.app.inject({
      method: 'POST',
      url: '/api/topics',
      headers: t.headers,
      payload: { workspaceId: ws.id, title: 'Sync', type: 'feat' },
    })
  ).json<{ actionId: string; slug: string; branch: string }>();
  await finished(created.actionId);
  const wt = join(ws.worktreesDir, created.slug);
  const topicId = (await state()).topics[0]?.id;
  if (!topicId) throw new Error('sujet manquant');

  // origin avance pendant que le sujet travaille : le topic devient « en retard ».
  commitFile(clone, 'depuis-origin.md', 'plus tard\n');
  sh(clone, 'push', '-q', 'origin', 'main');

  // et le sujet avance de son côté : « en avance » aussi, sur l'ancien point de base.
  commitFile(wt, 'depuis-le-sujet.md', 'en cours\n');

  const before = await gitLiveInfo(wt, 'main');
  expect(before).toEqual({ aheadBehind: { ahead: 1, behind: 1 }, rebaseInProgress: false });

  const sync = await t.d.app.inject({
    method: 'POST',
    url: `/api/topics/${topicId}/actions/topic.sync`,
    headers: t.headers,
  });
  expect(sync.statusCode).toBe(202);
  const { actionId: syncActionId } = sync.json<{ actionId: string }>();
  const fin = await finished(syncActionId);
  expect(fin.data.outcome).toBe('succeeded');

  const after = await gitLiveInfo(wt, 'main');
  expect(after).toEqual({ aheadBehind: { ahead: 1, behind: 0 }, rebaseInProgress: false });
  expect(sh(wt, 'rev-parse', 'origin/main')).toBe(sh(origin, 'rev-parse', 'main'));
  expect(sh(wt, 'log', '-1', '--format=%s')).toBe('ajout depuis-le-sujet.md');

  // Aucune régression sur topic.branch : la branche réelle reste celle attendue après le rebase.
  expect((await state()).topics).toMatchObject([{ branch: created.branch }]);
  expect(sh(wt, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(created.branch);
});

test('topic.sync : worktree manquant, 409', async () => {
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
  const sync = await t.d.app.inject({
    method: 'POST',
    url: `/api/topics/${topicId}/actions/topic.sync`,
    headers: t.headers,
  });
  expect(sync.statusCode).toBe(409);
  await finished(created.actionId);
});
