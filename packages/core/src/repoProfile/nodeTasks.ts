import type { UnitTask } from '../model/repoProfile';

/** package.json scripts that build or run the app, the usual names first. */
const TASK_SCRIPTS: [UnitTask['role'], string[]][] = [
  ['build', ['build']],
  ['run', ['dev', 'start', 'serve']],
];

/** How a package.json's scripts build and run it: `npm run build`, `npm start`, by its package manager. */
export function nodeTasks(o: { scripts: Record<string, unknown>; manager: string; dir: string }): UnitTask[] {
  return TASK_SCRIPTS.flatMap(([role, names]) => {
    const script = names.find((n) => typeof o.scripts[n] === 'string');
    if (!script) return [];
    const run = script === 'start' && o.manager !== 'bun' ? [o.manager, 'start'] : [o.manager, 'run', script];
    return [{ role, run, cwd: o.dir, from: `package.json scripts.${script}` }];
  });
}
