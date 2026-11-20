import { accessSync, constants, statSync } from 'node:fs';
import path from 'node:path';

/** Windows finds `npm` as `npm.cmd`; elsewhere a program is its name. */
function namesOf(program: string, env: NodeJS.ProcessEnv): string[] {
  if (process.platform !== 'win32') return [program];
  const exts = (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
  return [program, ...exts.map((e) => program + e.toLowerCase())];
}

function runnable(file: string) {
  try {
    if (!statSync(file).isFile()) return false;
    accessSync(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Where `program` is on `env.PATH`, as an absolute path, the way a shell would find it; undefined when it isn't.
 * Only absolute PATH entries count (a relative one depends on the folder a check runs in). Nothing is run.
 */
export function findProgram(program: string, env: NodeJS.ProcessEnv): string | undefined {
  if (!program || /[\\/]/.test(program)) return undefined;
  const dirs = (env.PATH ?? env.Path ?? '').split(path.delimiter).filter((d) => path.isAbsolute(d));
  for (const dir of dirs) {
    for (const name of namesOf(program, env)) {
      const file = path.join(dir, name);
      if (runnable(file)) return file;
    }
  }
  return undefined;
}
