import { programIdentity } from '../guides/programIdentity';
import { screenComposer } from './screenComposer';
import { screenMake } from './screenMake';
import { screenProject } from './screenProject';
import { screenScript } from './screenScript';
import { screenTaskRunner } from './screenTaskRunner';
import { screenTool } from './screenTool';
import type { Found, ScreenInput } from './screenTypes';
import { screenWrapped } from './screenWrapped';

/** Flags of `npx` that name the package elsewhere or run a command line: nothing to look for. */
const NPX_ELSEWHERE = /^(-p|--package|-c|--call)(=|$)/;

/**
 * The program as screening reads it: a bare name without a Windows extension, a path into the repo as written (its
 * file is what to look for), and undefined for a path outside the repo, which is never read as the tool it's named
 * after (`/tmp/x/pytest` is not pytest: programIdentity.ts).
 */
function programOf(argv0: string, cwd: string): string | undefined {
  const id = programIdentity(argv0, cwd);
  if (id.kind === 'outside') return undefined;
  return id.kind === 'bare' ? argv0.replace(/\.(cmd|exe)$/i, '') : argv0;
}

/** What screening says of a program outside the repo: nothing in the repo to read, and no check it knows. */
const outside = (argv0: string): Found[] => [
  { severity: 'unsure', text: `\`${argv0}\` is outside the repo: Teamtrail can't tell what it runs` },
];

/** Programs with their own reading of the repo; the rest go to screenProject. */
async function byProgram(program: string, input: ScreenInput): Promise<Found[]> {
  switch (program) {
    case 'npm':
    case 'pnpm':
    case 'yarn':
    case 'bun':
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
    case 'turbo':
    case 'nx':
      return screenTaskRunner(program, input);
    case 'composer':
      return screenComposer(input);
    default:
      return screenProject(program, input);
  }
}

/**
 * What screening finds for one command run in `cwd`: a wrapper's run form (`uv run --frozen pytest`, `bundle exec
 * rspec`) is its project file and then the tool it runs, screened the same way; anything else by its program.
 */
export async function screenArgv(run: string[], i: Pick<ScreenInput, 'files' | 'cwd'>): Promise<Found[]> {
  if (!run[0]) return [];
  const program = programOf(run[0], i.cwd);
  if (program === undefined) return outside(run[0]);
  const input = { ...i, program: run[0], args: run.slice(1) };
  const wrapped = await screenWrapped({ program, i: input, screen: screenArgv });
  return wrapped ?? byProgram(program, input);
}
