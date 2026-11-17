import { folderChain } from './folderChain';
import { repoPath } from './repoPath';
import type { Found, ScreenInput } from './screenTypes';

const PYTEST_FILES = ['pyproject.toml', 'pytest.ini', 'setup.cfg', 'tox.ini', 'setup.py', 'conftest.py'];
/** Interpreter flags whose value is the next word, or that run code given inline (nothing to look for). */
const VALUED = new Set(['-r', '--require', '--import', '--loader', '--experimental-loader', '-W', '-X']);
const INLINE = new Set(['-e', '--eval', '-p', '--print', '-c', '-m']);

/** The first file of the folder or a folder above that exists, if any. */
async function nearest(i: ScreenInput, names: string[]) {
  for (const dir of folderChain(i.cwd))
    for (const name of names) {
      const rel = repoPath(dir, name);
      if (rel !== undefined && (await i.files.kind(rel)) === 'file') return rel;
    }
  return undefined;
}

/** `go …` and `cargo …` need their module file in the folder or above. */
async function screenModule(i: ScreenInput, file: 'go.mod' | 'Cargo.toml'): Promise<Found[]> {
  if (await nearest(i, [file])) return [];
  const where = i.cwd ? ` in \`${i.cwd}\` or above it` : '';
  return [{ severity: 'wont-run', text: `No ${file}${where}` }];
}

/** `pytest` finds tests without settings too, but none here usually means it isn't set up. */
async function screenPytest(i: ScreenInput): Promise<Found[]> {
  if (await nearest(i, PYTEST_FILES)) return [];
  return [{ severity: 'unsure', text: 'No pyproject.toml, pytest.ini or setup.cfg: pytest may find no tests' }];
}

/** The script an interpreter runs (`node x.js`, `python x.py`, `bash x.sh`), or what it runs instead. */
function scriptOf(args: string[]): { module?: string; file?: string } {
  for (let n = 0; n < args.length; n++) {
    const a = args[n];
    if (a === '-m') return { module: args[n + 1] };
    if (INLINE.has(a)) return {};
    if (VALUED.has(a)) n++;
    else if (!a.startsWith('-')) return { file: a };
  }
  return {};
}

/** A file the command names: it must be in the repo. */
async function screenFile(i: ScreenInput, file: string): Promise<Found[]> {
  const rel = repoPath(i.cwd, file);
  if (rel === undefined || (await i.files.kind(rel))) return [];
  return [{ severity: 'wont-run', text: `No \`${rel}\`` }];
}

/** `node x.js`, `bash x.sh`, `python x.py`, `python -m pytest`. */
async function screenInterpreter(i: ScreenInput): Promise<Found[]> {
  const { module, file } = scriptOf(i.args);
  if (module === 'pytest') return screenPytest(i);
  if (file) return screenFile(i, file);
  return [];
}

const INTERPRETERS = new Set(['node', 'bash', 'sh', 'zsh', 'python', 'python3', 'ruby', 'tsx']);

/**
 * Programs whose project file or script screening can look for: `go`, `cargo`, `pytest`, an interpreter running a
 * file, and a program given as a path (`./scripts/check.sh`). Anything else: nothing to say.
 */
export async function screenProject(program: string, i: ScreenInput): Promise<Found[]> {
  if (program.includes('/')) return screenFile(i, program);
  if (program === 'go') return screenModule(i, 'go.mod');
  if (program === 'cargo') return screenModule(i, 'Cargo.toml');
  if (program === 'pytest') return screenPytest(i);
  if (INTERPRETERS.has(program)) return screenInterpreter(i);
  return [];
}
