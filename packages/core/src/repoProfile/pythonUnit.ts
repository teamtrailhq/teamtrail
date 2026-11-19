import type { RepoUnit, Toolchain, UnitCommand } from '../model/repoProfile';
import { depNeeds } from './depNeeds';
import { pythonInstall, pythonManager, pythonRunner } from './pythonManager';
import { tomlString } from './tomlGet';
import { tomlTables, type TomlValue } from './tomlLite';
import { toolPin } from './toolPin';
import type { UnitContext } from './types';

const MANIFESTS = ['pyproject.toml', 'setup.py', 'setup.cfg', 'Pipfile', 'requirements.txt'];
const DEP_FILES = /^(pyproject\.toml|setup\.py|setup\.cfg|Pipfile|requirements.*\.txt)$/;

type Tables = Map<string, Map<string, TomlValue>>;

/** The texts that list dependencies, joined, for finding a tool's name in them. */
async function depText(ctx: UnitContext): Promise<string> {
  const files = [...ctx.folder.files].filter((f) => DEP_FILES.test(f)).sort();
  const texts = await Promise.all(files.map((f) => ctx.read(f)));
  return texts.join('\n').toLowerCase();
}

/** Which tools the unit uses, by their config or a dependency on them. */
function toolsOf(ctx: UnitContext, tables: Tables, deps: Set<string>) {
  const has = (f: string) => ctx.folder.files.has(f);
  return {
    pytest:
      tables.has('tool.pytest.ini_options') ||
      has('pytest.ini') ||
      has('conftest.py') ||
      deps.has('pytest') ||
      ctx.folder.dirs.has('tests'),
    ruff: tables.has('tool.ruff') || has('ruff.toml') || has('.ruff.toml') || deps.has('ruff'),
    mypy: tables.has('tool.mypy') || has('mypy.ini') || deps.has('mypy'),
  };
}

function commandsOf(o: { tools: ReturnType<typeof toolsOf>; manager: string; dir: string }): UnitCommand[] {
  const run = pythonRunner(o.manager);
  const out: UnitCommand[] = [];
  if (o.tools.pytest) out.push({ role: 'test', run: [...run, 'pytest'], cwd: o.dir, from: 'pytest configuration' });
  if (o.tools.ruff) out.push({ role: 'lint', run: [...run, 'ruff', 'check', '.'], cwd: o.dir, from: 'ruff' });
  if (o.tools.mypy) out.push({ role: 'typecheck', run: [...run, 'mypy', '.'], cwd: o.dir, from: 'mypy' });
  return out;
}

async function pythonPin(ctx: UnitContext, tables: Tables, manifest: string): Promise<Toolchain | undefined> {
  const pinned = await toolPin(ctx, { name: 'python', files: ['.python-version'], aliases: ['python'] });
  if (pinned) return pinned;
  const requires = tomlString(tables, 'project', 'requires-python');
  if (requires) return { name: 'python', version: requires, from: `${manifest} requires-python` };
  const poetry = tomlString(tables, 'tool.poetry.dependencies', 'python');
  return poetry ? { name: 'python', version: poetry, from: `${manifest} tool.poetry.dependencies.python` } : undefined;
}

/**
 * A Python folder (pyproject.toml, setup.py, setup.cfg, Pipfile or requirements.txt): its manager (uv, poetry,
 * pipenv, pdm, pip), lockfile, Python pin, pytest/ruff/mypy run the manager's way, and browser or Docker needs.
 */
export async function pythonUnit(ctx: UnitContext): Promise<RepoUnit[]> {
  const { folder } = ctx;
  const manifest = MANIFESTS.find((f) => folder.files.has(f));
  if (!manifest) return [];
  const pyproject = folder.files.has('pyproject.toml') ? await ctx.read('pyproject.toml') : undefined;
  const tables: Tables = pyproject ? tomlTables(pyproject) : new Map();
  const uv = ctx.memberOf(['uv']);
  const { manager, lockfile } = pythonManager({ folder, tables, uvMember: !!uv });
  const words = new Set((await depText(ctx)).match(/[a-z0-9][a-z0-9._-]*/g) ?? []);
  const install = uv ? undefined : pythonInstall(manager, folder);
  const toolchain = await pythonPin(ctx, tables, folder.dir ? `${folder.dir}/${manifest}` : manifest);
  const file = folder.dir ? `${folder.dir}/${manifest}` : manifest;
  return [
    {
      dir: folder.dir,
      ecosystem: 'python',
      manager,
      manifest,
      ...(lockfile ? { lockfile } : {}),
      ...(uv ? { memberOf: uv.dir } : {}),
      ...(toolchain ? { toolchain } : {}),
      ...(install ? { install } : {}),
      commands: commandsOf({ tools: toolsOf(ctx, tables, words), manager, dir: folder.dir }),
      needs: depNeeds({ deps: words, file }),
    },
  ];
}
