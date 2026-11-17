import type { CheckFinding, RepoFiles, ScreenedCheck } from '../model/checkScreening';
import { repoPath } from './repoPath';
import { screenMake } from './screenMake';
import { screenProject } from './screenProject';
import { screenScript } from './screenScript';
import { screenTool } from './screenTool';
import type { Found, ScreenInput } from './screenTypes';

/** Flags of `npx` that name the package elsewhere or run a command line: nothing to look for. */
const NPX_ELSEWHERE = /^(-p|--package|-c|--call)(=|$)/;

/** The program's name without a folder or a Windows extension, unless it's a path into the repo. */
function programOf(argv0: string) {
  if (argv0.includes('/') && !argv0.startsWith('/')) return argv0;
  return (argv0.split('/').pop() ?? argv0).replace(/\.(cmd|exe)$/i, '');
}

/** What screening finds for one command run in `cwd`. */
async function screenArgv(run: string[], i: Omit<ScreenInput, 'args' | 'program'>): Promise<Found[]> {
  const program = programOf(run[0]);
  const input = { ...i, program: run[0], args: run.slice(1) };
  switch (program) {
    case 'npm':
    case 'pnpm':
    case 'yarn':
      return screenScript(program, input);
    case 'npx':
      if (input.args.some((a) => NPX_ELSEWHERE.test(a))) return [];
      return screenTool(
        input,
        input.args.find((a) => !a.startsWith('-')),
      );
    case 'make':
    case 'gmake':
      return screenMake(input);
    default:
      return screenProject(program, input);
  }
}

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
 * package.json script for `npm test` or `pnpm lint`, a dependency for `npx tool`, a go.mod, Cargo.toml or makefile
 * target, a file an interpreter runs. `wont-run`: it fails as the repo is now; `unsure`: Teamtrail can't tell.
 * Advice for the person setting or approving checks (and the agents who'd run them), never a refusal. Programs it
 * doesn't know get nothing. Pure: every file is read through `files` (model/checkScreening.ts `RepoFiles`).
 */
export async function screenChecks(o: { checks: ScreenedCheck[]; files: RepoFiles }): Promise<CheckFinding[]> {
  const found = await Promise.all(o.checks.map((c) => screenOne(c, o.files)));
  return o.checks.flatMap((c, n) => found[n].map((f) => ({ check: c.name, ...f })));
}
