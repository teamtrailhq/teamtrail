import { WRAPPER_SPECS, wrapperArgv } from '../verification/wrapperArgv';
import { isKnownCheck } from './knownChecks';
import { programOf } from './programRules';

/**
 * The wrappers a check may name, each with the flags it may take before the tool. `needs`: one of these must be
 * there, the flag that keeps the wrapper from resolving or downloading (`uv run --frozen`, `npx --no`). Everything
 * else a wrapper can do (add a package, point at an index, download a Python) stays refused.
 */
const ALLOWED: Record<string, { flags: string[]; needs?: string[] }> = {
  uv: {
    flags: [
      '--frozen',
      '--locked',
      '--offline',
      '--no-sync',
      '--no-dev',
      '--all-extras',
      '--all-groups',
      '--all-packages',
      '--no-default-groups',
      '--extra',
      '--group',
      '--only-group',
      '--no-group',
      '--package',
      '--directory',
      '--project',
      '--exact',
      '-q',
      '--quiet',
      '-v',
      '--verbose',
    ],
    needs: ['--frozen', '--locked'],
  },
  poetry: {
    flags: [
      '-q',
      '--quiet',
      '-n',
      '--no-interaction',
      '--no-ansi',
      '-v',
      '--verbose',
      '-C',
      '--directory',
      '-P',
      '--project',
    ],
  },
  pipenv: { flags: ['-q', '--quiet', '-v', '--verbose'] },
  bundle: { flags: [] },
  composer: { flags: ['-d', '--working-dir', '-q', '--quiet', '-n', '--no-interaction'] },
  pnpm: {
    flags: ['--filter', '-F', '-C', '--dir', '-r', '--recursive', '-w', '--workspace-root', '-s', '--silent'],
  },
  npx: { flags: ['--no', '--no-install', '-q', '--quiet'], needs: ['--no', '--no-install'] },
};

/** What a wrapper's argv comes to: not a wrapper's run form, refused, or the tool it runs. */
export type Wrapped =
  | { kind: 'none' }
  | { kind: 'refused'; problem: string }
  | { kind: 'tool'; argv0: string; program: string; args: string[] };

const outsideRepo = (dir: string) => dir.startsWith('/') || /^[a-zA-Z]:/.test(dir) || dir.split(/[\\/]/).includes('..');

/** Why the wrapper's own flags are refused, if they are. */
function flagProblem(program: string, flags: { name: string; value?: string }[]): string | undefined {
  const allowed = ALLOWED[program];
  const odd = flags.find((f) => !allowed.flags.includes(f.name));
  if (odd) return `runs ${program} with ${odd.name}, which may download or run other code`;
  const dir = flags.find((f) => f.value !== undefined && WRAPPER_SPECS[program].dir?.includes(f.name))?.value;
  if (dir !== undefined && outsideRepo(dir)) return `runs ${program} in a folder outside the repo (${dir})`;
  if (allowed.needs && !flags.some((f) => allowed.needs!.includes(f.name)))
    return `runs ${program} without ${allowed.needs.join(' or ')}, so it may resolve and download packages`;
  return undefined;
}

/**
 * A check that runs a known tool through the project's own environment: `uv run --frozen pytest`, `poetry run
 * pytest`, `pipenv run pytest`, `bundle exec rspec`, `composer exec phpunit`, `pnpm exec vitest`, `npx --no eslint`.
 * Allowed only when the tool after the wrapper is itself a known check and the wrapper's flags can't download or
 * reach elsewhere; any other tool through a wrapper is refused, since the wrapper could run anything installed.
 */
export function wrappedCheck(program: string, args: string[]): Wrapped {
  if (!ALLOWED[program]) return { kind: 'none' };
  const w = wrapperArgv(program, args);
  if (!w) return { kind: 'none' };
  const problem = flagProblem(program, w.flags);
  if (problem) return { kind: 'refused', problem };
  const [argv0 = '', ...rest] = w.tool;
  const tool = { argv0, program: programOf(argv0), args: rest };
  if (!argv0 || WRAPPER_SPECS[tool.program] || !isKnownCheck(tool))
    return {
      kind: 'refused',
      problem: `runs ${argv0 || 'nothing'} through ${program}; only a known check may run through it`,
    };
  return { kind: 'tool', ...tool };
}
