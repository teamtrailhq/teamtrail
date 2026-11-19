import { depPath } from './depPath';
import { nearestFile } from './nearestFile';
import { repoPath } from './repoPath';
import { screenProjectFile } from './screenStacks';
import type { Found, ScreenInput } from './screenTypes';
import { screenWrapperScript } from './screenWrapperScript';

const PYTEST_FILES = ['pyproject.toml', 'pytest.ini', 'setup.cfg', 'tox.ini', 'setup.py', 'conftest.py'];
/** Interpreter flags whose value is the next word, or that run code given inline (nothing to look for). */
const VALUED = new Set(['-r', '--require', '--import', '--loader', '--experimental-loader', '-W', '-X', '-d']);
const INLINE = new Set(['-e', '--eval', '-p', '--print', '-c', '-m']);

/** `pytest` finds tests without settings too, but none here usually means it isn't set up. */
async function screenPytest(i: ScreenInput): Promise<Found[]> {
  if (await nearestFile({ ...i, names: PYTEST_FILES })) return [];
  return [{ severity: 'unsure', text: 'No pyproject.toml, pytest.ini or setup.cfg: pytest may find no tests' }];
}

/** `tox` reads tox.ini, or a `[tool.tox]` / `[tox:tox]` section of pyproject.toml or setup.cfg. */
async function screenTox(i: ScreenInput): Promise<Found[]> {
  if (await nearestFile({ ...i, names: ['tox.ini'], here: true })) return [];
  for (const [file, header] of [
    ['pyproject.toml', '[tool.tox]'],
    ['setup.cfg', '[tox:tox]'],
  ])
    if ((await i.files.read(repoPath(i.cwd, file) ?? file))?.includes(header)) return [];
  const where = i.cwd ? ` in \`${i.cwd}\`` : '';
  return [{ severity: 'wont-run', text: `No tox.ini${where}` }];
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

/** A file the command names: it must be in the repo; a program in a dependency folder must be installed. */
async function screenFile(i: ScreenInput, file: string): Promise<Found[]> {
  const installed = await depPath({ files: i.files, cwd: i.cwd, program: file });
  if (installed) return installed;
  const rel = repoPath(i.cwd, file);
  if (rel === undefined) return [];
  if (!(await i.files.kind(rel))) return [{ severity: 'wont-run', text: `No \`${rel}\`` }];
  return screenWrapperScript({ ...i, rel });
}

/** `node x.js`, `bash x.sh`, `python x.py`, `php artisan test`, `python -m pytest`. */
async function screenInterpreter(i: ScreenInput): Promise<Found[]> {
  const { module, file } = scriptOf(i.args);
  if (module === 'pytest') return screenPytest(i);
  if (file) return screenFile(i, file);
  return [];
}

/** `mvn -f other/pom.xml …`: the file it names instead of the folder's pom.xml. */
function mavenFile(args: string[]): string | undefined {
  const at = args.findIndex((a) => a === '-f' || a === '--file');
  if (at >= 0) return args[at + 1];
  return args.find((a) => a.startsWith('--file='))?.slice('--file='.length);
}

const INTERPRETERS = new Set(['node', 'bash', 'sh', 'zsh', 'python', 'python3', 'ruby', 'tsx', 'php']);

/**
 * Programs whose project file or script screening can look for: a program given as a path (`./gradlew`,
 * `.venv/bin/pytest`), a project file (go.mod, Cargo.toml, build.gradle, pom.xml, Package.swift, mix.exs…), pytest
 * and tox settings, and an interpreter running a file. Anything else: nothing to say.
 */
export async function screenProject(program: string, i: ScreenInput): Promise<Found[]> {
  if (program.includes('/')) return screenFile(i, program);
  if (program === 'pytest') return screenPytest(i);
  if (program === 'tox') return screenTox(i);
  if (program === 'mvn' && mavenFile(i.args)) return screenFile(i, mavenFile(i.args)!);
  const project = await screenProjectFile(program, i);
  if (project) return project;
  if (INTERPRETERS.has(program)) return screenInterpreter(i);
  return [];
}
