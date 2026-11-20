import type { ProposedCheck } from '../model/guide';
import { pmRoute, type JsPackageManager } from '../verification/pmRoute';
import { argsProblem, genericCodeProblem } from './argRules';
import { gitProblem } from './gitArgv';
import { inlineCodeProblem } from './inlineCode';
import { isKnownCheck, knownShape } from './knownChecks';
import { knownProgram } from './programIdentity';
import { NETWORK_TOOLS, PACKAGE_MANAGERS, programOf, RUNNERS, SHELLS, WRAPPERS } from './programRules';
import { wrappedCheck } from './wrappedCheck';

/** The first argument that isn't a flag: the subcommand, wherever the global flags put it. */
const firstPositional = (args: string[]) => args.find((a) => !a.startsWith('-'))?.toLowerCase() ?? '';

/** A Python module run with `-m x` or `-mx`, if any. */
function pythonModule(args: string[]): string | undefined {
  const at = args.findIndex((a) => a.startsWith('-m'));
  if (at < 0) return undefined;
  return args[at] === '-m' ? args[at + 1] : args[at].slice(2);
}

const DOWNLOADING_MODULES = new Set(['pip', 'ensurepip', 'pipx', 'uv', 'venv', 'http.server', 'webbrowser']);

const JS_PMS = new Set(['npm', 'pnpm', 'yarn', 'bun']);

/** A package manager's routing flags read away (`npm -w web install x` is `install x`); and where they send it. */
function routedArgs(program: string, args: string[]) {
  if (!JS_PMS.has(program)) return { args, dir: undefined };
  const route = pmRoute(program as JsPackageManager, args);
  return { args: route.words, dir: route.dir };
}

function programProblem(program: string, all: string[]): string | undefined {
  const { args, dir } = routedArgs(program, all);
  if (dir !== undefined && (dir.startsWith('/') || dir.split(/[\\/]/).includes('..')))
    return `runs ${program} in a folder outside the repo (${dir})`;
  if (SHELLS.has(program)) return `runs a shell (${program}); name the program and its arguments instead`;
  if (NETWORK_TOOLS.has(program)) return `runs ${program}, which reaches the network`;
  if (RUNNERS.has(program)) return `runs ${program}, which downloads and runs a package; use one installed in the repo`;
  if (WRAPPERS.has(program))
    return `runs ${program}, which runs another program or commands; name that program instead`;
  if (program.startsWith('git-')) return `runs a git program directly (${program})`;
  const sub = firstPositional(args);
  if (PACKAGE_MANAGERS[program]?.has(sub))
    return `runs ${program} ${sub}, which downloads packages; use one installed in the repo`;
  if (program === 'python' && DOWNLOADING_MODULES.has(pythonModule(args) ?? ''))
    return `runs python -m ${pythonModule(args)}, which downloads or serves`;
  if (program === 'find' && args.some((a) => /^-(exec|execdir|ok|okdir|delete)$/.test(a)))
    return 'runs find with -exec or -delete, which runs or removes other things';
  return undefined;
}

/** `program` is the base name, which the refusals go by; whether it's a known check goes by its identity. */
type Parts = { argv0: string; program: string; args: string[]; cwd?: string };

function parts(spec: ProposedCheck): Parts {
  const argv0 = spec.run[0] ?? '';
  return { argv0, program: programOf(argv0), args: spec.run.slice(1), cwd: spec.cwd };
}

/** Why one command's argv is refused, read as the program reads it. */
function argvProblems({ argv0, program, args, cwd }: Parts): string[] {
  const known = knownShape({ argv0, args, cwd });
  return [
    programProblem(program, args),
    inlineCodeProblem(program, args),
    program === 'git' ? gitProblem(args) : undefined,
    argsProblem(program, args),
    genericCodeProblem(args, known),
  ].filter((p): p is string => !!p);
}

/** A wrapper's own words, then the tool it runs judged as a check of its own (wrappedCheck.ts). */
function commandProblems(p: Parts): string[] {
  const wrapped = wrappedCheck(p);
  switch (wrapped.kind) {
    case 'none':
      return argvProblems(p);
    case 'refused':
      return [wrapped.problem];
    case 'tool':
      return [argsProblem(p.program, p.args), ...argvProblems(wrapped)].filter((x): x is string => !!x);
    default: {
      const never: never = wrapped;
      return never;
    }
  }
}

/**
 * Why a check's argv is refused, if it is: argv that itself carries code or downloads code. The program is matched
 * by its base name (a path, `.exe` or a version suffix doesn't hide it) and flags are read the way the program reads
 * them. Refused for every program: remote URLs anywhere in an argument, `pkg@version`, registry specifiers and flags
 * that run a command they're given. Refused outright: shells, network tools, package runners and installs, programs
 * that run other programs, interpreters given inline code, git commands that reach a remote. A program Teamtrail
 * doesn't know with a run-this-code flag is refused too. A wrapper that runs a tool from the project's environment
 * (`uv run --frozen`, `poetry run`, `pipenv run`, `bundle exec`, `composer exec`, `pnpm exec`, `npx --no`) is allowed
 * only for a known check, which is then read like any other. What repo files run (npm scripts, Makefiles, test files) is
 * covered by the person's approval of the command, not by this.
 */
export function checkArgv(spec: ProposedCheck): string[] {
  const problems = commandProblems(parts(spec));
  if (spec.cwd && (spec.cwd.startsWith('/') || spec.cwd.split(/[\\/]/).includes('..')))
    problems.push('cwd must stay inside the repo');
  return problems;
}

export const UNKNOWN_PROGRAM = "unknown program: Teamtrail can't tell what this runs";

/**
 * Why a check that isn't refused still needs the person's explicit acknowledgement: its argv isn't one of the known
 * check shapes (knownChecks.ts), or its program is named by a path anywhere but the repo's own tool folders
 * (`/tmp/x/pytest`, `../x/jest`: programIdentity.ts), a wrapper's included. Approved on its own, never in bulk.
 */
export function checkNotice(spec: ProposedCheck): string | undefined {
  if (checkArgv(spec).length) return undefined;
  const p = parts(spec);
  if (!knownProgram(p.argv0, p.cwd)) return UNKNOWN_PROGRAM;
  // a wrapper's run form that isn't refused runs a known check (wrappedCheck.ts)
  if (wrappedCheck(p).kind === 'tool') return undefined;
  return isKnownCheck(p) ? undefined : UNKNOWN_PROGRAM;
}
