import type { RepoFiles } from '../model/checkScreening';
import { folderChain } from './folderChain';
import { installHint } from './installHint';
import { repoPath } from './repoPath';
import type { Found } from './screenTypes';

/** Yarn Plug'n'Play installs no node_modules: whether a program is installed can't be read from folders there. */
const PNP = ['.pnp.cjs', '.pnp.js'];

/**
 * Whether a program from the project's npm packages is installed where the check runs: `node_modules/.bin/<bin>` in
 * the folder or one above it. A `not-installed` finding when it isn't, with how to install; nothing when the files
 * can't show installs (`seesInstalls`), under Plug'n'Play, or when it is there.
 */
export async function nodeInstall(o: { files: RepoFiles; cwd: string; bin: string }): Promise<Found[]> {
  const { files, cwd, bin } = o;
  if (!files.seesInstalls) return [];
  let modules = false;
  for (const dir of folderChain(cwd)) {
    for (const pnp of PNP) if ((await files.kind(repoPath(dir, pnp) ?? pnp)) === 'file') return [];
    if (await files.kind(repoPath(dir, 'node_modules/.bin', bin) ?? '')) return [];
    modules ||= (await files.kind(repoPath(dir, 'node_modules') ?? 'node_modules')) === 'dir';
  }
  const where = cwd ? ` in \`${cwd}\` or above it` : '';
  const why = modules ? `no \`node_modules/.bin/${bin}\`${where}` : `no node_modules${where}`;
  const fix = await installHint({ files, cwd, kind: 'node' });
  return [{ severity: 'wont-run', cause: 'not-installed', text: `\`${bin}\` isn't installed: ${why}; ${fix}` }];
}
