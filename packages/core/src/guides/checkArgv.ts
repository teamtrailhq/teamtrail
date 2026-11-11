import type { ProposedCheck } from '../model/guide';
import { gitProblem } from './gitArgv';
import { inlineCodeProblem } from './inlineCode';
import { NETWORK_TOOLS, PACKAGE_MANAGERS, programOf, RUNNERS, SHELLS, WRAPPERS } from './programRules';

/** A URL in an argument, other than this machine: the check would reach out. */
const REMOTE_URL = /^(https?|ssh|git|ftp|s3):\/\/(?!(localhost|127\.0\.0\.1)(:\d+)?(\/|$))|^[\w.-]+@[\w.-]+:/i;

function programProblem(program: string, args: string[]): string | undefined {
  if (SHELLS.has(program)) return `runs a shell (${program}); name the program and its arguments instead`;
  if (NETWORK_TOOLS.has(program)) return `runs ${program}, which reaches the network`;
  if (RUNNERS.has(program)) return `runs ${program}, which downloads and runs a package; use one installed in the repo`;
  if (WRAPPERS.has(program)) return `runs ${program}, which runs another program; name that program instead`;
  const sub = (args[0] ?? '').toLowerCase();
  if (PACKAGE_MANAGERS[program]?.has(sub))
    return `runs ${program} ${sub}, which downloads packages; use one installed in the repo`;
  if (program === 'find' && args.some((a) => /^-(exec|execdir|ok|okdir|delete)$/.test(a)))
    return 'runs find with -exec or -delete, which runs or removes other things';
  return undefined;
}

/**
 * Why a check's argv is unsafe to propose, if it is. The program is matched by its base name (a path, a `.exe` or a
 * version suffix doesn't hide it), and flags are read the way the program would (combined short flags, `-cCODE`,
 * `--eval=CODE`). Refused: shells, network tools, package runners and installs, programs that run other programs,
 * interpreters given code inline, git commands that reach a remote or change git's config, and remote URLs.
 */
export function checkArgv(spec: ProposedCheck): string[] {
  const program = programOf(spec.run[0] ?? '');
  const args = spec.run.slice(1);
  const problems = [
    programProblem(program, args),
    inlineCodeProblem(program, args),
    program === 'git' ? gitProblem(args) : undefined,
    args.some((a) => REMOTE_URL.test(a)) ? 'names a remote address, so it reaches the network' : undefined,
  ].filter((p): p is string => !!p);
  if (spec.cwd && (spec.cwd.startsWith('/') || spec.cwd.split(/[\\/]/).includes('..')))
    problems.push('cwd must stay inside the repo');
  return problems;
}
