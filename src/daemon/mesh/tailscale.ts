import { execFile } from 'node:child_process';
import type { MeshTailscale } from '../../shared/model.js';

/** `tailscale status --json` : `BackendState` vaut `Running`, `Stopped`, `NeedsLogin`… (D37 : lu, jamais piloté ici). */
export function parseTailscaleStatus(stdout: string): MeshTailscale {
  try {
    const parsed = JSON.parse(stdout) as { BackendState?: unknown };
    return parsed.BackendState === 'Running' ? 'running' : 'stopped';
  } catch {
    return 'stopped';
  }
}

export type TailscaleExec = (
  bin: string,
  args: string[],
) => Promise<{ stdout: string; code: string | null }>;

const realExec: TailscaleExec = (bin, args) =>
  new Promise((resolve) => {
    execFile(bin, args, { timeout: 5000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) =>
      resolve({
        stdout: String(stdout ?? ''),
        code: err ? ((err as NodeJS.ErrnoException).code ?? 'ERR') : null,
      }),
    );
  });

/** Binaire absent ⇒ `absent` ; sinon l'état que le JSON annonce (un `status` en code 1 reste lisible quand l'app est arrêtée). */
export async function tailscaleState(
  bin: string,
  exec: TailscaleExec = realExec,
): Promise<MeshTailscale> {
  const { stdout, code } = await exec(bin, ['status', '--json']);
  if (code === 'ENOENT' || code === 'EACCES') return 'absent';
  if (stdout.trim() === '') return code === null ? 'stopped' : 'absent';
  return parseTailscaleStatus(stdout);
}
