import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Type } from '@sinclair/typebox';
import type { FastifyInstance } from 'fastify';
import { monotonicFactory } from 'ulid';
import { isValidSlug, slugify } from '../../shared/slug.js';
import { type ActionContext, scriptEnv, startAction } from '../actions/service.js';
import { findAssetDir } from '../assets.js';
import type { AidConfig } from '../config.js';
import type { Db } from '../db.js';
import { AidHttpError } from '../errors.js';
import type { Indexer } from '../topics/index.js';

const ulid = monotonicFactory();
const FIVE_MIN = 5 * 60_000;

const CreateBody = Type.Object(
  {
    workspaceId: Type.String({ minLength: 1 }),
    title: Type.String({ minLength: 1, maxLength: 200 }),
    type: Type.Unsafe<'feat' | 'fix' | 'chore' | 'spike'>({
      type: 'string',
      enum: ['feat', 'fix', 'chore', 'spike'],
    }),
    slug: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export interface TopicRouteDeps {
  db: Db;
  config: AidConfig;
  actions: ActionContext;
  indexer: Indexer;
}

interface WorkspaceRow {
  id: string;
  name: string;
  root: string;
  base_branch: string;
  worktrees_dir: string;
}

export function registerTopicRoutes(app: FastifyInstance, deps: TopicRouteDeps): void {
  const scripts = findAssetDir('scripts/git', 'topic-create.sh');

  app.post('/api/topics', { schema: { body: CreateBody } }, async (req, reply) => {
    const body = req.body as { workspaceId: string; title: string; type: string; slug?: string };
    const ws = deps.db.prepare('SELECT * FROM workspaces WHERE id = ?').get(body.workspaceId) as
      WorkspaceRow | undefined;
    if (!ws) throw new AidHttpError(404, 'workspace inconnu');
    let slug: string;
    if (body.slug !== undefined) {
      if (!isValidSlug(body.slug)) throw new AidHttpError(422, `slug invalide : ${body.slug}`);
      slug = body.slug;
    } else {
      try {
        slug = slugify(body.title);
      } catch (err) {
        throw new AidHttpError(422, (err as Error).message);
      }
    }
    if (
      deps.db.prepare('SELECT 1 FROM topics WHERE workspace_id = ? AND slug = ?').get(ws.id, slug)
    ) {
      throw new AidHttpError(409, `un sujet « ${slug} » existe déjà dans ce workspace`);
    }
    const topicId = `tp_${ulid()}`;
    const branch = `${body.type}/${slug}`;
    const worktree = join(ws.worktrees_dir, slug);

    const { actionId } = startAction(deps.actions, {
      workspaceId: ws.id,
      action: 'topic.create',
      script: join(scripts, 'topic-create.sh'),
      cwd: ws.root,
      timeoutMs: FIVE_MIN,
      data: { slug, branch },
      env: scriptEnv(process.env, deps.config.env.strip, {
        AID_REPO_ROOT: ws.root,
        AID_TOPIC: topicId,
        AID_SLUG: slug,
        AID_BRANCH: branch,
        AID_BASE: ws.base_branch,
        AID_WORKTREE: worktree,
      }),
      afterSuccess: () => {
        // D6 : on n'indexe que si le dépôt principal a déjà adopté l'index
        const indexed = existsSync(join(ws.root, '.codegraph'));
        const now = new Date().toISOString();
        deps.actions.store.append(
          {
            source: 'daemon',
            type: 'topic.state',
            workspaceId: ws.id,
            topicId,
            data: { state: 'active', indexState: indexed ? 'indexing' : 'disabled' },
          },
          (tx) => {
            tx.prepare('INSERT INTO topics VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)').run(
              topicId,
              ws.id,
              slug,
              body.title,
              body.type,
              branch,
              ws.base_branch,
              worktree,
              'active',
              indexed ? 'indexing' : 'disabled',
              now,
              now,
            );
            tx.prepare("INSERT INTO runs VALUES (?, ?, 'standard', 'open', ?)").run(
              `run_${ulid()}`,
              topicId,
              now,
            );
          },
        );
        if (indexed) deps.indexer.start({ id: topicId, workspaceId: ws.id, worktree });
        return { topicId };
      },
    });
    return reply.code(202).send({ actionId, slug, branch });
  });
}
