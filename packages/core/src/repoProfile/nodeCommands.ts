import type { CommandRole, UnitCommand } from '../model/repoProfile';

/** package.json scripts by what they're for, the usual names first. */
const ROLE_SCRIPTS: [CommandRole, string[]][] = [
  ['test', ['test']],
  ['lint', ['lint']],
  ['typecheck', ['typecheck', 'type-check', 'check-types', 'types', 'tsc']],
  ['format', ['format:check', 'format-check', 'prettier:check', 'fmt:check']],
  ['build', ['build']],
];

/** npm's placeholder test script, which only fails. */
const PLACEHOLDER = /no test specified/;

/** How a package manager runs a script: `npm test` and `npm run lint`; bun's own `test` is its runner, not the script. */
function scriptArgv(manager: string, script: string): string[] {
  if (script === 'test' && manager !== 'bun') return [manager, 'test'];
  return [manager, 'run', script];
}

/**
 * The commands a package.json's scripts give, one per role, run by its package manager in its own folder. A build
 * only when there's no test, as the next best check.
 */
export function nodeCommands(o: { scripts: Record<string, unknown>; manager: string; dir: string }): UnitCommand[] {
  const out: UnitCommand[] = [];
  for (const [role, names] of ROLE_SCRIPTS) {
    const script = names.find((n) => typeof o.scripts[n] === 'string' && !PLACEHOLDER.test(o.scripts[n] as string));
    if (!script) continue;
    if (role === 'build' && out.some((c) => c.role === 'test')) continue;
    out.push({ role, run: scriptArgv(o.manager, script), cwd: o.dir, from: `package.json scripts.${script}` });
  }
  return out;
}
