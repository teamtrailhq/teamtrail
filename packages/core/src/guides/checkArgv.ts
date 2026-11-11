import type { ProposedCheck } from '../model/guide';
import { argsProblem, genericCodeProblem } from './argRules';
import { gitProblem } from './gitArgv';
import { inlineCodeProblem } from './inlineCode';
import { isKnownCheck } from './knownChecks';
import { NETWORK_TOOLS, PACKAGE_MANAGERS, programOf, RUNNERS, SHELLS, WRAPPERS } from './programRules';

/** The first argument that isn't a flag: the subcommand, wherever the global flags put it. */
const firstPositional = (args: string[]) => args.find((a) => !a.startsWith('-'))?.toLowerCase() ?? '';

/** A Python module run with `-m x` or `-mx`, if any. */
function pythonModule(args: string[]): string | undefined {
  const at = args.findIndex((a) => a.startsWith('-m'));
  if (at < 0) return undefined;
  return args[at] === '-m' ? args[at + 1] : args[at].slice(2);
}

const DOWNLOADING_MODULES = new Set(['pip', 'ensurepip', 'pipx', 'uv', 'venv', 'http.server', 'webbrowser']);

function programProblem(program: string, args: string[]): string | undefined {
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

function parts(spec: ProposedCheck) {
  const argv0 = spec.run[0] ?? '';
  return { argv0, program: programOf(argv0), args: spec.run.slice(1) };
}

/**
 * Why a check's argv is refused, if it is: argv that itself carries code or downloads code. The program is matched
 * by its base name (a path, `.exe` or a version suffix doesn't hide it) and flags are read the way the program reads
 * them. Refused for every program: remote URLs anywhere in an argument, `pkg@version`, registry specifiers and flags
 * that run a command they're given. Refused outright: shells, network tools, package runners and installs, programs
 * that run other programs, interpreters given inline code, git commands that reach a remote. A program Teamtrail
 * doesn't know with a run-this-code flag is refused too. What repo files run (npm scripts, Makefiles, test files) is
 * covered by the person's approval of the command, not by this.
 */
export function checkArgv(spec: ProposedCheck): string[] {
  const { argv0, program, args } = parts(spec);
  const known = isKnownCheck({ argv0, program, args });
  const problems = [
    programProblem(program, args),
    inlineCodeProblem(program, args),
    program === 'git' ? gitProblem(args) : undefined,
    argsProblem(program, args),
    known ? undefined : genericCodeProblem(args),
  ].filter((p): p is string => !!p);
  if (spec.cwd && (spec.cwd.startsWith('/') || spec.cwd.split(/[\\/]/).includes('..')))
    problems.push('cwd must stay inside the repo');
  return problems;
}

export const UNKNOWN_PROGRAM = "unknown program: Teamtrail can't tell what this runs";

/**
 * Why a check that isn't refused still needs the person's explicit acknowledgement: its argv isn't one of the known
 * check shapes (knownChecks.ts). Approved on its own, never in bulk.
 */
export function checkNotice(spec: ProposedCheck): string | undefined {
  if (checkArgv(spec).length) return undefined;
  const { argv0, program, args } = parts(spec);
  return isKnownCheck({ argv0, program, args }) ? undefined : UNKNOWN_PROGRAM;
}
