import { expect, test } from 'vitest';
import {
  gitAtLeast,
  nodeSupported,
  type MeshProbe,
  type Probes,
  runChecks,
  runDoctor,
} from '../src/cli/commands/doctor.js';
import { resolvePaths } from '../src/daemon/paths.js';
import type { IndexStatus } from '../src/shared/structural.js';

const good: Probes = {
  nodeVersion: 'v22.23.3',
  platform: 'darwin',
  procVersion: null,
  has: () => true,
  version: async () => 'git version 2.54.0',
  loadPty: async () => null,
  loadSqlite: async () => null,
  homeMode: () => 0o40700,
  port: async () => ({ port: 4870, state: 'libre' }),
  claudeHooks: () => true,
  memoryHealth: async () => null,
  mcpRegistration: () => false,
  structural: async () => null,
  install: () => ({ mode: 'repo', version: null }),
  mesh: async () => null,
};

const levels = async (over: Partial<Probes>) =>
  (await runChecks({ ...good, ...over })).map((c) => `${c.level}:${c.label}`);

test('une machine saine : aucun ⚠ ni ✗', async () => {
  const checks = await runChecks(good);
  expect(checks.filter((c) => c.level !== 'ok')).toEqual([]);
});

test('versions de node prises en charge', () => {
  for (const v of ['v22.12.0', 'v22.23.3', 'v24.21.0']) expect(nodeSupported(v), v).toBe(true);
  for (const v of ['v20.19.0', 'v22.11.0', 'v25.0.0']) expect(nodeSupported(v), v).toBe(false);
});

test('git : seuil 2.38', () => {
  expect(gitAtLeast('git version 2.54.0 (Apple Git-157)', 2, 38)).toBe(true);
  expect(gitAtLeast('git version 2.34.1', 2, 38)).toBe(false);
  expect(gitAtLeast('inconnu', 2, 38)).toBe(true);
});

test('node hors plage, node-pty ou sqlite cassés, git ou bash absents : ✗', async () => {
  expect(await levels({ nodeVersion: 'v20.1.0' })).toContain('ko:node v20.1.0');
  expect(await levels({ loadPty: async () => 'posix_spawnp failed' })).toContain('ko:node-pty');
  expect(await levels({ loadSqlite: async () => 'bindings introuvables' })).toContain(
    'ko:better-sqlite3',
  );
  expect(await levels({ version: async () => null })).toContain('ko:git');
  expect(await levels({ has: (b) => b !== 'bash' })).toContain('ko:bash');
});

test('node-pty en échec sous Linux : le message nomme build-essential et python3', async () => {
  const checks = await runChecks({ ...good, platform: 'linux', loadPty: async () => 'gyp ERR!' });
  const ko = checks.find((c) => c.label === 'node-pty')!;
  expect(ko.detail).toContain('build-essential');
  expect(ko.detail).toContain('python3');
});

test('claude, codex, codegraph, gh et ollama absents : ⚠ seulement, avec leur conséquence', async () => {
  const checks = await runChecks({ ...good, has: (b) => b === 'bash' });
  const warns = checks.filter((c) => c.level === 'warn');
  expect(warns.map((c) => c.label)).toEqual([
    'claude introuvable',
    'codex introuvable',
    'codegraph introuvable',
    'gh introuvable',
    'ollama introuvable',
  ]);
  expect(warns.find((c) => c.label.startsWith('codegraph'))?.detail).toContain('lecture directe');
  expect(warns.find((c) => c.label.startsWith('ollama'))?.detail).toContain('FTS5 seule');
  expect(checks.some((c) => c.level === 'ko')).toBe(false);
});

test('gh présent mais non authentifié : ⚠ distinct de l’absence du binaire', async () => {
  const checks = await levels({
    version: async (bin) => (bin === 'gh' ? null : 'git version 2.54.0'),
  });
  expect(checks).toContain('warn:gh non authentifié');
  expect(checks.some((l) => l === 'warn:gh introuvable')).toBe(false);
});

test('gh absent : pas de vérification de session (rien à authentifier)', async () => {
  const checks = await levels({ has: (b) => b !== 'gh' });
  expect(checks.some((l) => l.includes('authentifié'))).toBe(false);
});

test('codegraph présent : sa version s’affiche', async () => {
  const checks = await levels({
    version: async (bin) => (bin === 'codegraph' ? 'codegraph 1.6.2' : 'git version 2.54.0'),
  });
  expect(checks).toContain('ok:codegraph codegraph 1.6.2');
});

test('codegraph présent mais --version échoue : ⚠ distinct de l’absence du binaire', async () => {
  const checks = await levels({
    version: async (bin) => (bin === 'codegraph' ? null : 'git version 2.54.0'),
  });
  expect(checks).toContain('warn:codegraph : version illisible');
  expect(checks.some((l) => l === 'warn:codegraph introuvable')).toBe(false);
});

test('codegraph absent : pas de vérification de version (rien à sonder)', async () => {
  const checks = await levels({ has: (b) => b !== 'codegraph' });
  expect(checks.some((l) => l.includes('illisible'))).toBe(false);
});

test('~/.aid autre que 0700 : ✗ ; absent : rien à dire', async () => {
  expect(await levels({ homeMode: () => 0o40755 })).toContain('ko:~/.aid en 755');
  expect((await levels({ homeMode: () => null })).some((l) => l.includes('~/.aid'))).toBe(false);
});

test('port : libre, occupé par un autre programme (✗), ou déjà A-I-D (✓)', async () => {
  expect(await levels({ port: async () => ({ port: 4870, state: 'occupe' }) })).toContain(
    'ko:port 4870 occupé',
  );
  expect(await levels({ port: async () => ({ port: 4870, state: 'aid' }) })).toContain(
    'ok:port 4870 : le daemon A-I-D tourne',
  );
});

test('WSL2 : wslview absent est un ⚠ ; hors WSL2 on n’en parle pas', async () => {
  const wsl = {
    procVersion: 'Linux version 5.15.0-microsoft-standard-WSL2',
    platform: 'linux' as const,
  };
  expect(await levels({ ...wsl, has: (b) => b !== 'wslview' })).toContain(
    'warn:wslview introuvable',
  );
  expect((await levels({ has: (b) => b !== 'wslview' })).some((l) => l.includes('wslview'))).toBe(
    false,
  );
});

test('mémoire : daemon arrêté ou injoignable → pas de ligne', async () => {
  expect(
    (await levels({ memoryHealth: async () => null })).some((l) => l.includes('mémoire')),
  ).toBe(false);
});

test('mémoire : N pages par namespace, triées, aucune anomalie → ✓', async () => {
  const checks = await runChecks({
    ...good,
    memoryHealth: async () => ({
      pages: { aid: 1, lesson: 1 },
      fts: true,
      vectors: 'off',
      pendingJobs: 0,
      failedJobs: 0,
      mirrorDirty: false,
    }),
  });
  expect(checks).toContainEqual({ level: 'ok', label: 'mémoire : 2 pages (aid 1, lesson 1)' });
});

test('mémoire : miroir non commité ou jobs en échec → ⚠ avec la commande ou le journal', async () => {
  const dirty = await runChecks({
    ...good,
    memoryHealth: async () => ({
      pages: { aid: 1 },
      fts: true,
      vectors: 'ollama',
      pendingJobs: 0,
      failedJobs: 0,
      mirrorDirty: true,
    }),
  });
  const dirtyCheck = dirty.find((c) => c.label.startsWith('mémoire'))!;
  expect(dirtyCheck).toMatchObject({ level: 'warn' });
  expect(dirtyCheck.detail).toContain('aid mem reindex');

  const failed = await runChecks({
    ...good,
    memoryHealth: async () => ({
      pages: { aid: 1 },
      fts: true,
      vectors: 'ollama',
      pendingJobs: 0,
      failedJobs: 2,
      mirrorDirty: false,
    }),
  });
  const failedCheck = failed.find((c) => c.label.startsWith('mémoire'))!;
  expect(failedCheck).toMatchObject({ level: 'warn' });
  expect(failedCheck.detail).toContain('2 jobs');
  expect(failedCheck.detail).toContain('journal');
});

test('runDoctor : code 1 s’il y a un ✗, 0 sinon, et une ligne par contrôle', async () => {
  const lines: string[] = [];
  expect(await runDoctor(resolvePaths('/tmp/x'), good, (s) => lines.push(s))).toBe(0);
  expect(lines[0]).toMatch(/^aidboard \d/);
  expect(lines.some((l) => l.includes('✓ node v22'))).toBe(true);
  expect(
    await runDoctor(resolvePaths('/tmp/x'), { ...good, loadPty: async () => 'x' }, () => undefined),
  ).toBe(1);
});

test('hooks Claude Code absents : un ⚠ qui dit l’effet et la commande ; sans claude, rien', async () => {
  const checks = await runChecks({ ...good, claudeHooks: () => false });
  expect(checks.find((c) => c.label === 'hooks Claude Code absents')).toMatchObject({
    level: 'warn',
    detail: expect.stringContaining('aid hooks install'),
  });
  const sansClaude = await levels({ claudeHooks: () => false, has: (b) => b !== 'claude' });
  expect(sansClaude.some((l) => l.includes('hooks'))).toBe(false);
});

test('~/.claude.json pointe encore aid-memory : ⚠ qui nomme les deux noms ; sans claude, rien', async () => {
  const checks = await runChecks({ ...good, mcpRegistration: () => true });
  const warn = checks.find((c) => c.label.includes('aid-memory'))!;
  expect(warn.level).toBe('warn');
  expect(warn.detail).toContain('aid-memory');
  expect(warn.detail).toContain('aid mcp');
  const sansClaude = await levels({ mcpRegistration: () => true, has: (b) => b !== 'claude' });
  expect(sansClaude.some((l) => l.includes('aid-memory'))).toBe(false);
});

test('~/.claude.json déjà sous aid, ou absent : rien', async () => {
  expect(
    (await levels({ mcpRegistration: () => false })).some((l) => l.includes('aid-memory')),
  ).toBe(false);
});

const indexStatus: IndexStatus = {
  engine: 'codegraph',
  state: 'ready',
  indexedAt: 't0',
  files: 10,
  symbols: 20,
  languages: ['ts'],
  pending: 0,
  engineVersion: '1.6.0',
  builtWith: '1.6.2',
  capabilities: ['explore'],
};

test('codegraph présent, index bâti par une version différente : décalage affiché (pas une erreur)', async () => {
  const checks = await runChecks({
    ...good,
    version: async (bin) => (bin === 'codegraph' ? 'codegraph 1.6.0' : 'git version 2.54.0'),
    structural: async () => indexStatus,
  });
  const line = checks.find((c) => c.label === 'codegraph codegraph 1.6.0')!;
  expect(line.level).toBe('ok');
  expect(line.detail).toContain('CLI 1.6.0, index bâti par 1.6.2');
  expect(line.detail).toContain('reindex conseillé');
});

test('codegraph présent, même version que l’index bâti : aucun décalage à afficher', async () => {
  const checks = await runChecks({
    ...good,
    version: async (bin) => (bin === 'codegraph' ? 'codegraph 1.6.2' : 'git version 2.54.0'),
    structural: async () => indexStatus,
  });
  const line = checks.find((c) => c.label === 'codegraph codegraph 1.6.2')!;
  expect(line.level).toBe('ok');
  expect(line.detail).toBeUndefined();
});

test('index indisponible (daemon arrêté ou moteur coupé) : la version s’affiche sans décalage, sans plantage', async () => {
  const checks = await runChecks({
    ...good,
    version: async (bin) => (bin === 'codegraph' ? 'codegraph 1.6.2' : 'git version 2.54.0'),
    structural: async () => null,
  });
  const line = checks.find((c) => c.label === 'codegraph codegraph 1.6.2')!;
  expect(line.level).toBe('ok');
  expect(line.detail).toBeUndefined();
});

test('installation (13.2) : repo et release sont ✓ avec leur mode, inconnu est un ⚠', async () => {
  expect(await levels({})).toContain(
    'ok:installation : mode repo (clone git, mise à jour par pull et build)',
  );
  expect(await levels({ install: () => ({ mode: 'release', version: '0.2.0' }) })).toContain(
    'ok:installation : release 0.2.0 (~/.aid/server, mise à jour par les releases GitHub)',
  );
  const checks = await runChecks({ ...good, install: () => ({ mode: 'inconnu', version: null }) });
  const warn = checks.find((c) => c.label === 'installation : mode inconnu')!;
  expect(warn.level).toBe('warn');
  expect(warn.detail).toContain('install-server.sh');
});

const meshOk: MeshProbe = {
  cell: 'morzu-mac',
  bin: 'swarph',
  cellFile: '/home/j/.config/swarph/cells/morzu-mac.yaml',
  cellFileReadable: true,
  tokenExists: true,
  gateway: 'http://mesh-gw.example.ts.net:8788',
  tailscale: 'running',
};

test('mesh (12.2) : désactivé = une ligne ✓ et rien d’autre ; configuré et sain = aucun ⚠', async () => {
  const off = await runChecks(good);
  expect(off.filter((c) => /mesh|swarph|Tailscale|cell|token/.test(c.label))).toEqual([
    { level: 'ok', label: 'mesh : désactivé (`mesh.cell` vide dans config.yaml)' },
  ]);
  const on = await runChecks({
    ...good,
    mesh: async () => meshOk,
    version: async (bin) => (bin === 'swarph' ? '0.72.25' : 'git version 2.54.0'),
  });
  expect(on.filter((c) => c.level !== 'ok')).toEqual([]);
  expect(on.map((c) => c.label)).toEqual(
    expect.arrayContaining([
      'swarph 0.72.25',
      'cell morzu-mac (/home/j/.config/swarph/cells/morzu-mac.yaml)',
      'token de morzu-mac présent',
      'gateway http://mesh-gw.example.ts.net:8788',
      'Tailscale : connecté',
    ]),
  );
});

test('mesh (12.2) : chaque prérequis manquant est un ⚠ nommé, le token n’est jamais affiché', async () => {
  const mesh = (over: Partial<typeof meshOk>) => ({
    ...good,
    mesh: async () => ({ ...meshOk, ...over }),
  });
  const sans = await runChecks({ ...mesh({}), has: (b) => b !== 'swarph' });
  const swarph = sans.find((c) => c.label === 'swarph introuvable')!;
  expect(swarph.level).toBe('warn');
  expect(swarph.detail).toContain('uv tool install --python 3.12 swarph-cli');
  expect(sans.some((c) => c.level === 'ko')).toBe(false);

  const illisible = await runChecks({
    ...mesh({}),
    version: async (bin) => (bin === 'swarph' ? null : 'git version 2.54.0'),
  });
  expect(illisible.find((c) => c.label === 'swarph : version illisible')!.level).toBe('warn');

  expect(await levels({ ...mesh({ cellFileReadable: false }) })).toContain(
    'warn:cell morzu-mac : fichier illisible',
  );
  const token = (await runChecks(mesh({ tokenExists: false }))).find(
    (c) => c.label === 'token de morzu-mac absent',
  )!;
  expect(token.level).toBe('warn');
  expect(token.detail).toContain('swarph onboard morzu-mac');
  expect(await levels(mesh({ gateway: '' }))).toContain('warn:mesh.gateway vide');
  const stopped = (await runChecks(mesh({ tailscale: 'stopped' }))).find(
    (c) => c.label === 'Tailscale arrêté',
  )!;
  expect(stopped.level).toBe('warn');
  expect(stopped.detail).toContain('mesh.tailscale.manage');
  expect(await levels(mesh({ tailscale: 'absent' }))).toContain('warn:Tailscale introuvable');
  // ni le contenu d'un token, ni un chemin de token réel : seule la convention est citée
  const all = await runDoctorLines(mesh({ tokenExists: false }));
  expect(all.join('\n')).not.toMatch(/peer_token[^\n]*[A-Za-z0-9]{20,}/);
});

async function runDoctorLines(p: Probes): Promise<string[]> {
  const lines: string[] = [];
  await runDoctor(resolvePaths('/nonexistent/aid-home'), p, (s) => lines.push(s));
  return lines;
}
