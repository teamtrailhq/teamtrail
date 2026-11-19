import type { RepoFiles } from '../model/checkScreening';
import { installHint, type InstallKind } from './installHint';
import { repoPath } from './repoPath';
import type { Found } from './screenTypes';

/** A program inside a folder that installs create: npm's bins, a Python virtualenv, Composer's vendor/bin. */
const DEP_PATH = /^(?:\.\/)?((?:[\w.@-]+\/)*?)(node_modules\/\.bin|\.?venv\/(?:bin|Scripts)|vendor\/bin)\/[^/]+$/;

const KIND: Record<string, InstallKind> = { node_modules: 'node', '.venv': 'python', venv: 'python', vendor: 'php' };

/**
 * A program named by its path into a dependency folder (`.venv/bin/pytest`, `vendor/bin/phpunit`,
 * `node_modules/.bin/eslint`), when it isn't there: `not-installed`, since installing the dependencies creates it; a
 * fresh clone never has it. Undefined for any other path. Empty when it is there, or when the files can't show
 * installs (`seesInstalls`): a hosted run installs before its checks.
 */
export async function depPath(o: { files: RepoFiles; cwd: string; program: string }): Promise<Found[] | undefined> {
  const m = DEP_PATH.exec(o.program);
  if (!m) return undefined;
  const rel = repoPath(o.cwd, o.program);
  if (rel === undefined || !o.files.seesInstalls || (await o.files.kind(rel))) return [];
  const folder = m[2].split('/')[0];
  const unit = repoPath(o.cwd, m[1]) ?? o.cwd;
  const dep = repoPath(unit, folder) ?? folder;
  const there = (await o.files.kind(dep)) === 'dir';
  const why = there ? `no \`${rel}\`` : `no \`${dep}\``;
  const fix = await installHint({ files: o.files, cwd: unit, kind: KIND[folder] });
  return [{ severity: 'wont-run', cause: 'not-installed', text: `\`${o.program}\` isn't installed: ${why}; ${fix}` }];
}
