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

/** The program's name without a folder or a Windows extension, unless it's a path into the repo. */
function programOf(argv0: string) {
  if (argv0.includes('/') && !argv0.startsWith('/')) return argv0;
  return (argv0.split('/').pop() ?? argv0).replace(/\.(cmd|exe)$/i, '');
}

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
  const program = programOf(run[0]);
  const input = { ...i, program: run[0], args: run.slice(1) };
  const wrapped = await screenWrapped({ program, i: input, screen: screenArgv });
  return wrapped ?? byProgram(program, input);
}
