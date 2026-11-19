import { repoPath } from '../verification/repoPath';

/** Flags that run a script across a workspace's packages, and those that move it to another folder. */
const ACROSS = /^(-w|--workspace|--workspaces|-ws|-r|--recursive|--filter|-F)(=|$)/;
const MOVE = /^(--prefix|-C|--dir|--cwd)(=|$)/;
const VALUED = new Set(['-w', '--workspace', '--filter', '-F', '--prefix', '-C', '--dir', '--cwd']);

/** A flag's value: after `=`, else the next word for flags that take one. */
function flagValue(args: string[], n: number) {
  const a = args[n];
  if (a.includes('=')) return { value: a.slice(a.indexOf('=') + 1), next: n };
  return VALUED.has(a) ? { value: args[n + 1], next: n + 1 } : { value: undefined, next: n };
}

/** A package manager's words without the flags that move it (`--prefix`) or run it across packages (`-w`). */
export function pkgArgs(args: string[], dir: string) {
  let at = dir;
  let across = false;
  const words: string[] = [];
  for (let n = 0; n < args.length; n++) {
    const a = args[n];
    if (!ACROSS.test(a) && !MOVE.test(a)) {
      words.push(a);
      continue;
    }
    const { value, next } = flagValue(args, n);
    n = next;
    if (MOVE.test(a)) at = repoPath(dir, value) ?? dir;
    else across = true;
  }
  return { at, across, words };
}

/** The folder (`-C`), makefile (`-f`) and first target of a `make` command. */
export function makeArgs(args: string[], dir: string) {
  let at = dir;
  let file: string | undefined;
  let target = '';
  for (let n = 0; n < args.length; n++) {
    const a = args[n];
    if (a === '-C' || a === '--directory') at = repoPath(at, args[++n]) ?? at;
    else if (a === '-f' || a === '--file' || a === '--makefile') file = args[++n];
    else if (!a.startsWith('-') && !a.includes('=') && !target) target = a;
  }
  return { at, file, target };
}
