/** What a task runner over a workspace runs: targets, in the projects named or (none named) every project. */
export interface TaskRun {
  targets: string[];
  projects: string[];
}

/** Flags whose value is the next word, not a task. */
const TURBO_VALUED = new Set([
  '--filter',
  '-F',
  '--cache-dir',
  '--concurrency',
  '--output-logs',
  '--log-order',
  '--env-mode',
]);

/** `turbo run test lint`, `turbo test`; `web#test` is `test` in the package named `web`. */
export function turboRun(args: string[]): TaskRun {
  const words = args.filter((a, n) => !a.startsWith('-') && !TURBO_VALUED.has(args[n - 1] ?? ''));
  const tasks = words[0] === 'run' ? words.slice(1) : words;
  return {
    targets: tasks.map((t) => t.split('#').pop() ?? t),
    projects: tasks.filter((t) => t.includes('#')).map((t) => t.split('#')[0]),
  };
}

/** The values of `-t`/`--target(s)`/`-p`/`--projects`, comma-separated or one per flag, until the next flag. */
function listed(args: string[], flags: string[]): string[] {
  const out: string[] = [];
  for (let n = 0; n < args.length; n++) {
    const [name, inline] = args[n].split(/=(.*)/s, 2);
    if (!flags.includes(name)) continue;
    if (inline !== undefined) out.push(...inline.split(','));
    else for (let m = n + 1; m < args.length && !args[m].startsWith('-'); m++) out.push(...args[m].split(','));
  }
  return out.filter(Boolean);
}

/**
 * `nx run web:test[:ci]`, `nx test web`, `nx run-many -t test lint -p web api`, `nx affected -t test`: the targets
 * and the projects (none: every project the run may reach).
 */
export function nxRun(args: string[]): TaskRun {
  const words = args.filter((a) => !a.startsWith('-'));
  const [sub, next] = words;
  if (sub === 'run' && next?.includes(':')) {
    const [project, target] = next.split(':');
    return { targets: [target], projects: [project] };
  }
  if (sub === 'run-many' || sub === 'affected')
    return { targets: listed(args, ['-t', '--target', '--targets']), projects: listed(args, ['-p', '--projects']) };
  if (!sub || sub === 'run') return { targets: [], projects: [] };
  return { targets: [sub], projects: next ? [next] : [] };
}
