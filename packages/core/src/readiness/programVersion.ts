import { execFile } from 'node:child_process';
import { realpathSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const TIMEOUT_MS = 3000;
/** Version managers' shims pick a version per folder: what they print outside the repo says nothing. */
const SHIMS = [
  /[\\/]\.asdf[\\/]shims[\\/]/,
  /[\\/]mise[\\/]shims[\\/]/,
  /[\\/]\.pyenv[\\/]shims[\\/]/,
  /[\\/]\.rbenv[\\/]shims[\\/]/,
  /[\\/]\.volta[\\/]bin[\\/]/,
  /[\\/]\.nodenv[\\/]shims[\\/]/,
  /[\\/]\.goenv[\\/]shims[\\/]/,
  /[\\/]\.jenv[\\/]shims[\\/]/,
];
const MANAGERS = ['asdf', 'mise', 'pyenv', 'rbenv', 'Volta', 'nodenv', 'goenv', 'jenv'];

/** Versions already read, by the program file as it was then (path, size, mtime): one run per binary. */
const seen = new Map<string, Promise<string | undefined>>();

/** The version manager whose shim `file` is, or undefined for a real binary. */
export function shimOf(file: string): string | undefined {
  const i = SHIMS.findIndex((re) => re.test(file));
  return i === -1 ? undefined : MANAGERS[i];
}

function run(file: string, args: string[], env: NodeJS.ProcessEnv): Promise<string | undefined> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { cwd: os.tmpdir(), env, timeout: TIMEOUT_MS, maxBuffer: 64 * 1024, windowsHide: true },
      (_err, stdout, stderr) => {
        const found = /\d+(?:\.\d+)+/.exec(`${stdout}\n${stderr}`)?.[0];
        resolve(found);
      },
    );
  });
}

/**
 * The version `file` prints with `args` (`node --version` → `20.11.0`), or undefined. Run only for a program found
 * on PATH outside `repoRoot` (never a file in the repo, whatever PATH says), in a temp folder so no repo config is
 * read, with the checks' environment and a 3 s limit. A version manager's shim is not run.
 */
export function programVersion(o: {
  file: string;
  args: string[];
  repoRoot: string;
  env: NodeJS.ProcessEnv;
}): Promise<string | undefined> {
  if (shimOf(o.file)) return Promise.resolve(undefined);
  let real: string;
  let key: string;
  try {
    real = realpathSync(o.file);
    const repo = realpathSync(o.repoRoot);
    if (real === repo || real.startsWith(repo + path.sep)) return Promise.resolve(undefined);
    const st = statSync(real);
    key = `${real}\0${st.size}\0${st.mtimeMs}\0${o.args.join(' ')}`;
  } catch {
    return Promise.resolve(undefined);
  }
  const cached = seen.get(key);
  if (cached) return cached;
  const read = run(real, o.args, o.env);
  seen.set(key, read);
  return read;
}
