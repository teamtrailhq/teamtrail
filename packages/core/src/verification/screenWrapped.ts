import { depPath } from './depPath';
import { nearestFile } from './nearestFile';
import { repoPath } from './repoPath';
import { screenProjectFile } from './screenStacks';
import type { Found, ScreenInput } from './screenTypes';
import { wrapperArgv } from './wrapperArgv';

/** Screens a command in a folder: screenArgv, passed in so this file doesn't import it back. */
export type ScreenFn = (run: string[], i: Pick<ScreenInput, 'files' | 'cwd'>) => Promise<Found[]>;

/** The lockfile `uv run --frozen` / `--locked` installs from: without it uv stops. */
async function uvLock(i: Pick<ScreenInput, 'files' | 'cwd'>, flags: string[]): Promise<Found[]> {
  if (!flags.includes('--frozen') && !flags.includes('--locked')) return [];
  if (await nearestFile({ ...i, names: ['uv.lock'] })) return [];
  const where = i.cwd ? ` in \`${i.cwd}\` or above it` : '';
  return [{ severity: 'wont-run', text: `No uv.lock${where}, which \`uv run --frozen\` installs from` }];
}

/** `composer exec phpunit` runs `vendor/bin/phpunit`. */
async function composerExec(i: Pick<ScreenInput, 'files' | 'cwd'>, tool: string): Promise<Found[]> {
  if (tool.includes('/')) return [];
  return (await depPath({ files: i.files, cwd: i.cwd, program: `vendor/bin/${tool}` })) ?? [];
}

/**
 * `uv run --frozen pytest`, `poetry run pytest`, `pipenv run pytest`, `bundle exec rspec`, `composer exec phpunit`:
 * the wrapper's project file (pyproject.toml, uv.lock, Pipfile, Gemfile, composer.json) in the folder it runs in or
 * above, then the tool it runs, screened as a check of its own. Undefined when the words aren't a wrapper's run form.
 */
export async function screenWrapped(o: {
  program: string;
  i: ScreenInput;
  screen: ScreenFn;
}): Promise<Found[] | undefined> {
  const { program, i } = o;
  const w = wrapperArgv(program, i.args);
  if (!w || program === 'npx' || program === 'pnpm') return undefined;
  const cwd = w.dir === undefined ? i.cwd : repoPath(i.cwd, w.dir);
  if (cwd === undefined || !w.tool.length) return [];
  const at = { files: i.files, cwd };
  const project = (await screenProjectFile(program, at)) ?? [];
  if (project.length) return project;
  if (program === 'uv') {
    const lock = await uvLock(
      at,
      w.flags.map((f) => f.name),
    );
    if (lock.length) return lock;
  }
  if (program === 'composer') return composerExec(at, w.tool[0]);
  return o.screen(w.tool, at);
}
