import { lstatSync } from 'node:fs';
import path from 'node:path';
import type { SetupSpec } from '../model/setup';
import { SETUP_SHAPES, type SetupShape } from './setupShapes';

/** The program as written, bare: a path (`./bin/npm`, `node_modules/.bin/x`) is never a setup program. */
function programOf(argv0: string): string | undefined {
  if (/[\\/]/.test(argv0)) return undefined;
  return argv0.replace(/\.(cmd|exe)$/i, '');
}

function shapeFor(run: string[]): SetupShape | undefined {
  const program = programOf(run[0] ?? '');
  return SETUP_SHAPES.find((s) => s.program === program && s.sub.every((w, i) => run[i + 1] === w));
}

const KNOWN = [...new Set(SETUP_SHAPES.map((s) => s.label))].join(', ');

/**
 * Why Teamtrail won't run a setup step as written, or undefined: only frozen installs from the repo's own lockfile
 * (setupShapes.ts), with no flag beyond the ones listed, in a folder inside the repo. Pure, from the argv alone.
 */
export function setupProblem(spec: Pick<SetupSpec, 'run' | 'cwd'>): string | undefined {
  if (spec.cwd && (path.isAbsolute(spec.cwd) || spec.cwd.split(/[\\/]/).includes('..')))
    return 'its folder must stay inside the repo';
  const shape = shapeFor(spec.run);
  if (!shape) return `isn't a frozen install Teamtrail runs (${KNOWN})`;
  const flags = spec.run.slice(1 + shape.sub.length);
  const other = flags.find((f) => !shape.flags.includes(f) && !shape.frozen.includes(f));
  if (other !== undefined) return `${shape.label} with ${JSON.stringify(other)}: only the frozen install itself runs`;
  if (shape.frozen.length && !flags.some((f) => shape.frozen.includes(f)))
    return `${shape.program} ${shape.sub.join(' ')} needs ${shape.frozen.join(' or ')}, so it installs exactly the lockfile`;
  return undefined;
}

/** Whether `rel` is a plain file in `dir` (a symbolic link is not). */
const fileIn = (dir: string, rel: string) => lstatSync(path.join(dir, rel), { throwIfNoEntry: false })?.isFile();

/**
 * Why a setup step can't run in `worktree`, or undefined: its argv (setupProblem), or no lockfile of its kind in its
 * folder there, so it would resolve versions instead of installing the locked ones.
 */
export function setupRefusal(spec: Pick<SetupSpec, 'run' | 'cwd'>, worktree: string): string | undefined {
  const problem = setupProblem(spec);
  if (problem) return problem;
  const shape = shapeFor(spec.run)!;
  const dir = path.join(worktree, spec.cwd ?? '.');
  if (!shape.lockfiles.some((f) => fileIn(dir, f)))
    return `no ${shape.lockfiles.join(' or ')} in ${spec.cwd && spec.cwd !== '.' ? spec.cwd : 'the repo'} on this commit`;
  return undefined;
}
