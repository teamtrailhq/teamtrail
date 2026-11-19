/*
 * Whether a failed check failed because of the machine it ran on rather than main's code. Read from what the check
 * itself reported and printed, deterministically; when unsure, it is a real failure (and holds as one).
 */

// colour codes: ESC, then `[`, parameters and a letter
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*[A-Za-z]`, 'g');

const NOT_FOUND = [
  /^(?:[\w./-]+: )?(?:line \d+: )?(?:\d+: )?([\w.@/+-]+): (?:command )?not found\s*$/m,
  /^'?([\w.@/+-]+)'? is not recognized as an internal or external command/m,
];
const JS_PACKAGE = [
  /Cannot find module '([^'.\\/][^']*)'/,
  /Cannot find package '([^'.\\/][^']*)'/,
  /ERR_MODULE_NOT_FOUND\][^\n]*?package '([^'.\\/][^']*)'/,
];
const PY_PACKAGE = /ModuleNotFoundError: No module named '([\w]+)/;
const PY_RUNNER = /No module named ([\w]+)\s*$/m;
const SERVICE = /\b(ECONNREFUSED|Connection refused|could not connect to server|Can't connect to (?:local )?MySQL)/i;

/** The first match's first group in the output. */
function first(text: string, patterns: RegExp[]): string | undefined {
  for (const p of patterns) {
    const m = p.exec(text);
    if (m) return m[1];
  }
  return undefined;
}

const program = (argv0: string) => argv0.split(/[\\/]/).pop() ?? argv0;

/** A missing program or package, from the output: `ng isn't installed here`. */
function missing(text: string, installed: boolean): string | undefined {
  const cmd = first(text, NOT_FOUND);
  if (cmd) return `${program(cmd)} isn't installed here`;
  // with the approved setup installed, a missing module is main's own problem, not the machine's
  if (installed) return undefined;
  const pkg = first(text, JS_PACKAGE) ?? first(text, [PY_PACKAGE, PY_RUNNER]);
  return pkg ? `the package ${pkg} isn't installed here` : undefined;
}

/**
 * Why a failed check failed for environment reasons, or undefined when it looks like a real failure: it couldn't
 * start (its program isn't there or can't be run), the shell couldn't find a command (exit 127, `not found`), a package isn't
 * installed (only when no approved setup installed the dependencies: `installed` false), or a service it connects to
 * isn't reachable.
 */
export function environmentCause(c: {
  argv: string[];
  exitCode: number | null;
  error?: string;
  timedOut: boolean;
  output: string;
  installed: boolean;
}): string | undefined {
  if (c.timedOut) return undefined;
  // the program isn't there (or can't be run): a folder missing on main is main's own problem
  if (c.error && /ENOENT|EACCES/.test(c.error)) return `${program(c.argv[0] ?? '')} isn't installed here`;
  const text = c.output.replace(ANSI, '');
  const why = missing(text, c.installed);
  if (why) return why;
  if (c.exitCode === 127) return "a command it runs isn't installed here";
  return SERVICE.test(text) ? "a service it connects to isn't reachable here" : undefined;
}
