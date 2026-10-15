import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import fastifyCookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AidConfig } from './config.js';
import { type AuthState, registerSecurity } from './security.js';

export interface ServerDeps {
  config: AidConfig;
  auth: AuthState;
  devOrigin?: string;
  webRoot?: string | null;
  logger?: boolean;
}

export function defaultWebRoot(): string | null {
  const root = fileURLToPath(new URL('../web/', import.meta.url));
  return existsSync(root) ? root : null;
}

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: deps.logger ?? false });
  await app.register(fastifyCookie);
  await app.register(fastifyWebsocket);
  registerSecurity(app, deps.auth, {
    getPort: () => (app.server.address() as AddressInfo | null)?.port ?? deps.config.port,
    devOrigin: deps.devOrigin,
  });
  const webRoot = deps.webRoot === undefined ? defaultWebRoot() : deps.webRoot;
  if (webRoot) {
    await app.register(fastifyStatic, { root: webRoot });
    app.setNotFoundHandler((req, reply) => {
      const api = req.url.startsWith('/api') || req.url.startsWith('/ws');
      if (req.method === 'GET' && !api) return reply.sendFile('index.html');
      return reply.code(404).send({ error: 'introuvable' });
    });
  }
  return app;
}
