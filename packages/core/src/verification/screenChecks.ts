import type { CheckFinding, RepoFiles, ScreenedCheck } from '../model/checkScreening';
import { repoPath } from './repoPath';
import { screenArgv } from './screenArgv';
import type { Found } from './screenTypes';

/** One check's findings: its folder first, then its command. */
async function screenOne(c: ScreenedCheck, files: RepoFiles): Promise<Found[]> {
  if (!c.run.length || !c.run[0]) return [];
  const cwd = repoPath(c.cwd);
  if (cwd === undefined) return [{ severity: 'wont-run', text: `Its folder \`${c.cwd}\` is outside the repository` }];
  if (cwd && (await files.kind(cwd)) !== 'dir') return [{ severity: 'wont-run', text: `No folder \`${cwd}\`` }];
  return screenArgv(c.run, { files, cwd });
}

/**
 * Reads the repository to tell whether each check's command can run as written, without running anything: a
 * package.json script for `npm test` or `pnpm lint` (in the workspace `-w`/`--filter` names), a dependency for
 * `npx tool`, a project file for go, cargo, gradle, mvn, swift, mix, dart, rake, bundle, poetry, pipenv, uv and
 * composer, a turbo task, a makefile target, a file an interpreter runs, and the tool a wrapper runs (`uv run
 * --frozen pytest`, `bundle exec rspec`). Where the files show installs (`RepoFiles.seesInstalls`), a program the
 * check needs from node_modules, a virtualenv or vendor/bin that isn't there is `cause: 'not-installed'`.
 * `wont-run`: it fails as the repo is now; `unsure`: Teamtrail can't tell.
 * Advice for the person setting or approving checks (and the agents who'd run them), never a refusal. Programs it
 * doesn't know get nothing. Pure: every file is read through `files` (model/checkScreening.ts `RepoFiles`).
 */
export async function screenChecks(o: { checks: ScreenedCheck[]; files: RepoFiles }): Promise<CheckFinding[]> {
  const found = await Promise.all(o.checks.map((c) => screenOne(c, o.files)));
  return o.checks.flatMap((c, n) => found[n].map((f) => ({ check: c.name, ...f })));
}
