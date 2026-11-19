import type { TomlValue } from './tomlLite';
import type { FolderView } from './types';

/** A Python unit's package manager and its lockfile, from the files in its folder and pyproject's tables. */
export function pythonManager(o: {
  folder: FolderView;
  tables: Map<string, Map<string, TomlValue>>;
  uvMember: boolean;
}): { manager: string; lockfile?: string } {
  const has = (f: string) => o.folder.files.has(f);
  if (has('uv.lock')) return { manager: 'uv', lockfile: 'uv.lock' };
  if (has('poetry.lock')) return { manager: 'poetry', lockfile: 'poetry.lock' };
  if (o.tables.has('tool.poetry')) return { manager: 'poetry' };
  if (has('Pipfile')) return { manager: 'pipenv', ...(has('Pipfile.lock') ? { lockfile: 'Pipfile.lock' } : {}) };
  if (has('pdm.lock')) return { manager: 'pdm', lockfile: 'pdm.lock' };
  if (o.uvMember) return { manager: 'uv' };
  return { manager: 'pip' };
}

/** How a manager runs a tool from the project's environment: `uv run --frozen pytest`, `python -m pytest`. */
export function pythonRunner(manager: string): string[] {
  if (manager === 'uv') return ['uv', 'run', '--frozen'];
  if (manager === 'poetry' || manager === 'pipenv' || manager === 'pdm') return [manager, 'run'];
  return ['python', '-m'];
}

/** The frozen install from the unit's lockfile (or requirements file for pip). */
export function pythonInstall(manager: string, folder: FolderView): string[] | undefined {
  if (manager === 'uv' && folder.files.has('uv.lock')) return ['uv', 'sync', '--frozen'];
  if (manager === 'poetry') return ['poetry', 'install', '--no-interaction'];
  if (manager === 'pipenv') return ['pipenv', 'install', '--deploy'];
  if (manager === 'pdm') return ['pdm', 'install', '--frozen-lockfile'];
  if (manager === 'pip' && folder.files.has('requirements.txt'))
    return ['python', '-m', 'pip', 'install', '-r', 'requirements.txt'];
  return undefined;
}
