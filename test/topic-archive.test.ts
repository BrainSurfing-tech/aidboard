import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { sh } from './helpers/git.js';
import { type Ctx, finished, makeTopic, postAction, setupWorkspace } from './helpers/topics.js';

let c: Ctx;
afterEach(async () => {
  await c?.t.d.stop();
});

const stashRefOf = (id: string) =>
  (
    c.t.db.prepare('SELECT stash_ref FROM topics WHERE id = ?').get(id) as {
      stash_ref: string | null;
    }
  ).stash_ref;

async function archiveAvecStash() {
  c = await setupWorkspace();
  const { wt, topicId } = await makeTopic(c);
  writeFileSync(join(wt, 'brouillon.txt'), 'à garder par stash\n');
  const r = await postAction(c, topicId, 'topic.cleanup', { dirtyAction: 'stash' });
  const fin = await finished(c.t, r.json().actionId);
  expect(fin.data.outcome).toBe('succeeded');
  expect(stashRefOf(topicId)).toMatch(/^[0-9a-f]{40}$/);
  return topicId;
}

test('archive.oublier-stash : la ref résout encore, le stash est réellement supprimé', async () => {
  const topicId = await archiveAvecStash();
  const r = await postAction(c, topicId, 'archive.oublier-stash');
  expect(r.statusCode).toBe(200);
  expect(r.json()).toMatchObject({ found: true });
  expect(stashRefOf(topicId)).toBeNull();
  expect(sh(c.clone, 'stash', 'list')).toBe('');
});

test('archive.oublier-stash : stash déjà supprimé à la main, la colonne se vide quand même', async () => {
  const topicId = await archiveAvecStash();
  sh(c.clone, 'stash', 'clear');
  const r = await postAction(c, topicId, 'archive.oublier-stash');
  expect(r.statusCode).toBe(200);
  expect(r.json()).toMatchObject({ found: false });
  expect(stashRefOf(topicId)).toBeNull();
});

test('archive.oublier-stash : aucun stash à oublier, 409', async () => {
  c = await setupWorkspace();
  const { topicId } = await makeTopic(c);
  const r = await postAction(c, topicId, 'topic.cleanup');
  await finished(c.t, r.json().actionId);
  expect((await postAction(c, topicId, 'archive.oublier-stash')).statusCode).toBe(409);
});

test('GET /api/topics/:id/events : journal et sujet minimal, même une fois archivé', async () => {
  const topicId = await archiveAvecStash();
  const res = await c.t.d.app.inject({
    url: `/api/topics/${topicId}/events`,
    headers: c.t.headers,
  });
  expect(res.statusCode).toBe(200);
  const body = res.json<{
    topic: { id: string; state: string; stashRef: string | null };
    events: Array<{ type: string }>;
  }>();
  expect(body.topic).toMatchObject({ id: topicId, state: 'archived' });
  expect(body.topic.stashRef).toMatch(/^[0-9a-f]{40}$/);
  expect(body.events.length).toBeGreaterThan(0);
  expect(body.events.some((e) => e.type === 'topic.stash')).toBe(true);
});

test('GET /api/topics/:id/events : sujet inconnu, 404', async () => {
  c = await setupWorkspace();
  const res = await c.t.d.app.inject({
    url: '/api/topics/tp_nope/events',
    headers: c.t.headers,
  });
  expect(res.statusCode).toBe(404);
});
