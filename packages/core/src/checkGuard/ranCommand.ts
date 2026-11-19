import { programIdentity } from '../guides/programIdentity';
import { repoPath } from '../verification/repoPath';
import { wrapperArgv } from '../verification/wrapperArgv';

/** Interpreters that may run an installed tool's script. */
const INTERPRETERS = /^(php|node|ruby|python[\d.]*)$/;

/**
 * The command a program runs in turn, and the folder it runs in: a wrapper's tool (`uv run --frozen pytest`, `bundle
 * exec rspec`; the one reading of wrappers, verification/wrapperArgv.ts), in the folder the wrapper moves to, or an
 * installed tool an interpreter runs (`php vendor/bin/phpunit`, `node node_modules/.bin/jest`). Undefined when it runs
 * nothing else, or a folder outside the repo.
 */
export function ranCommand(o: {
  program: string;
  args: string[];
  dir: string;
}): { cmd: string[]; dir: string } | undefined {
  const w = wrapperArgv(o.program, o.args);
  if (w) {
    const at = w.dir === undefined ? o.dir : repoPath(o.dir, w.dir);
    return at === undefined ? undefined : { cmd: w.tool, dir: at };
  }
  const installed = INTERPRETERS.test(o.program) && programIdentity(o.args[0] ?? '', o.dir).kind === 'tool';
  return installed ? { cmd: o.args, dir: o.dir } : undefined;
}
