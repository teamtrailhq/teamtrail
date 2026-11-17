/** What a package manager's command runs: a package.json script, a dependency's program, or nothing screening reads. */
export type ScriptPlan =
  | {
      kind: 'script';
      name: string;
      /** It fails without the script (else it may run a program of that name). */ strict: boolean;
    }
  | { kind: 'tool'; spec?: string }
  | { kind: 'none' };

export type PackageManager = 'npm' | 'pnpm' | 'yarn';

const NONE: ScriptPlan = { kind: 'none' };
const NPM_SCRIPT: Record<string, string> = { test: 'test', t: 'test', tst: 'test', start: 'start', stop: 'stop' };
const NPM_RUN = new Set(['run', 'run-script', 'rum', 'urn']);
const PNPM_OWN = new Set(
  'install i add remove rm uninstall update up upgrade dlx create init publish pack link ln unlink prune store why list ls outdated audit rebuild rb import fetch patch patch-commit config setup env deploy licenses doctor root bin server help install-test it'.split(
    ' ',
  ),
);
const YARN_OWN = new Set(
  'install add remove upgrade up why info init workspace workspaces dlx config cache set plugin pack npm constraints link unlink version node bin global import outdated audit autoclean check licenses login logout owner policies publish tag team generate-lock-entry help'.split(
    ' ',
  ),
);
/** Flags that send the command to another package or folder: screening would read the wrong package.json. */
const ELSEWHERE =
  /^(-w|--workspace|--workspaces|-ws|--prefix|-C|--dir|--filter|-F|--cwd|-r|--recursive|--if-present)(=|$)/;

function npmPlan([sub, next]: string[]): ScriptPlan {
  if (sub in NPM_SCRIPT) return { kind: 'script', name: NPM_SCRIPT[sub], strict: true };
  if (NPM_RUN.has(sub)) return next ? { kind: 'script', name: next, strict: true } : NONE;
  if (sub === 'exec' || sub === 'x') return { kind: 'tool', spec: next };
  return NONE;
}

function pnpmPlan([sub, next]: string[]): ScriptPlan {
  if (sub === 'run') return next ? { kind: 'script', name: next, strict: true } : NONE;
  if (sub === 'test' || sub === 't' || sub === 'start')
    return { kind: 'script', name: sub === 't' ? 'test' : sub, strict: true };
  if (sub === 'exec') return { kind: 'tool', spec: next };
  if (PNPM_OWN.has(sub)) return NONE;
  return { kind: 'script', name: sub, strict: false };
}

function yarnPlan([sub, next]: string[]): ScriptPlan {
  if (sub === 'run') return next ? { kind: 'script', name: next, strict: false } : NONE;
  if (sub === 'exec') return { kind: 'tool', spec: next };
  if (YARN_OWN.has(sub)) return NONE;
  return { kind: 'script', name: sub, strict: false };
}

/** What `npm …`, `pnpm …` or `yarn …` would run, read from its words after the program. */
export function scriptPlan(pm: PackageManager, args: string[]): ScriptPlan {
  if (args.some((a) => ELSEWHERE.test(a))) return NONE;
  const words = args.filter((a) => !a.startsWith('-'));
  if (!words.length) return NONE;
  switch (pm) {
    case 'npm':
      return npmPlan(words);
    case 'pnpm':
      return pnpmPlan(words);
    case 'yarn':
      return yarnPlan(words);
    default: {
      const never: never = pm;
      return never;
    }
  }
}
