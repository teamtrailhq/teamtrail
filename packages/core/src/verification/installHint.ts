import type { RepoFiles } from '../model/checkScreening';
import { folderChain } from './folderChain';
import { repoPath } from './repoPath';

/** The ecosystems whose installs screening can see in the checkout. */
export type InstallKind = 'node' | 'python' | 'php';

/** Lockfiles (or manifests) in the order they decide, and the frozen install each one means. */
const INSTALLS: Record<InstallKind, [file: string, run: string][]> = {
  node: [
    ['pnpm-lock.yaml', 'pnpm install --frozen-lockfile'],
    ['bun.lock', 'bun install --frozen-lockfile'],
    ['bun.lockb', 'bun install --frozen-lockfile'],
    ['yarn.lock', 'yarn install --frozen-lockfile'],
    ['package-lock.json', 'npm ci'],
    ['npm-shrinkwrap.json', 'npm ci'],
  ],
  python: [
    ['uv.lock', 'uv sync --frozen'],
    ['poetry.lock', 'poetry install'],
    ['Pipfile.lock', 'pipenv sync --dev'],
    ['requirements-dev.txt', 'pip install -r requirements-dev.txt'],
    ['requirements.txt', 'pip install -r requirements.txt'],
  ],
  php: [['composer.lock', 'composer install']],
};

const FALLBACK: Record<InstallKind, string> = {
  node: 'npm install',
  python: 'pip install -e .',
  php: 'composer install',
};

/** Yarn 2+ (a .yarnrc.yml next to the lockfile) spells a frozen install `--immutable`. */
async function yarnRun(files: RepoFiles, dir: string, run: string) {
  if (!run.startsWith('yarn')) return run;
  const berry = (await files.kind(repoPath(dir, '.yarnrc.yml') ?? '.yarnrc.yml')) === 'file';
  return berry ? 'yarn install --immutable' : run;
}

/**
 * How to install the dependencies a check in `cwd` needs, as one hint: the frozen install the nearest lockfile at or
 * above it means, and where to run it. "install the dependencies first (`npm ci` in `apps/web`)". Advice only:
 * Teamtrail doesn't install packages on this machine.
 */
export async function installHint(o: { files: RepoFiles; cwd: string; kind: InstallKind }): Promise<string> {
  for (const dir of folderChain(o.cwd))
    for (const [file, run] of INSTALLS[o.kind]) {
      if ((await o.files.kind(repoPath(dir, file) ?? file)) !== 'file') continue;
      const where = dir ? ` in \`${dir}\`` : '';
      return `install the dependencies first (\`${await yarnRun(o.files, dir, run)}\`${where})`;
    }
  return `install the dependencies first (\`${FALLBACK[o.kind]}\`)`;
}
