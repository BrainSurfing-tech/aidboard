import type { AidPaths } from '../../daemon/paths.js';

export async function runDoctor(paths: AidPaths): Promise<number> {
  console.log(`aid doctor : à venir (${paths.home})`);
  return 0;
}
