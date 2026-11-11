/** A URL anywhere in an argument (`--registry=https://…` too), other than this machine. */
const REMOTE_URL = /[a-z][\w+.-]*:\/\/(?!(localhost|127\.0\.0\.1)(:\d+)?(\/|$|\s))/i;
/** `user@host:path`, the scp form git and rsync take. */
const SCP_LIKE = /^[\w.-]+@[\w.-]+:/;
/** A package at a version (`evil@1.2.3`, `@scope/x@latest`, `example.com/x@latest`): something to download. */
const PACKAGE_AT = /^(@[\w.-]+\/)?[\w./-]+@[\w^~<>=*.-]+$/;
/** Package specifiers that name a registry rather than a file. */
const SPECIFIER = /(^|=)(npm|jsr|github|gitlab|bitbucket|git\+[a-z]+|https?):/i;
/** Long flags that run a command or code they're given, in any program. */
const EXEC_HOOK =
  /^--(to-command|checkpoint-action|use-compress-program|info-script|new-volume-script|unzip-command|open-files-in-pager|upload-pack|receive-pack|exec|ext-diff|eval|eval-command)(=|$)/i;
/** Short flags that do the same, for the programs that have them. */
const SHORT_HOOKS: Record<string, RegExp> = {
  tar: /^-[A-Za-z]*[IF]/,
  zip: /^-TT|^--unzip-command/,
  make: /^-E|^--eval/,
  perl: /^-[A-Za-z]*M/,
};

/** Why one argument carries or fetches code, if it does. Applies to every program, known or not. */
function argProblem(program: string, arg: string): string | undefined {
  if (REMOTE_URL.test(arg) || SCP_LIKE.test(arg)) return 'names a remote address, so it reaches the network';
  if (PACKAGE_AT.test(arg) && !arg.startsWith('-')) return `names a package to download (${arg})`;
  if (SPECIFIER.test(arg)) return `names a package from a registry (${arg})`;
  if (EXEC_HOOK.test(arg)) return `runs a command it's given (${arg.split('=')[0]})`;
  if (SHORT_HOOKS[program]?.test(arg)) return `runs a command or code it's given (${arg})`;
  if (program === 'make' && /^(SHELL|\.SHELLFLAGS|MAKESHELL)=/.test(arg)) return 'swaps the shell make runs';
  return undefined;
}

/** The first problem among the arguments: argv that itself carries code or downloads code. */
export function argsProblem(program: string, args: string[]): string | undefined {
  for (const arg of args) {
    const p = argProblem(program, arg);
    if (p) return p;
  }
  return undefined;
}

/** Flags that give an unknown program code to run: refused for any program Teamtrail doesn't know. */
const GENERIC_CODE =
  /^(-c|-e|-E|-ex|-x|-r|-command|-Command|-EncodedCommand)$|^--(eval|exec|command|expr|execute|run)(=|$)/;

/** Why an unknown program looks like it's given code inline, if it does. */
export const genericCodeProblem = (args: string[]) =>
  args.some((a) => GENERIC_CODE.test(a))
    ? 'passes a flag that usually means "run this code"; point at a script in the repo instead'
    : undefined;
