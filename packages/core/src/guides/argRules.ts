/** A URL anywhere in an argument (`--registry=https://…` too), other than this machine. */
const REMOTE_URL = /[a-z][\w+.-]*:\/\/(?!(localhost|127\.0\.0\.1)(:\d+)?(\/|$|\s))/i;
/** `user@host:path`, the scp form git and rsync take. */
const SCP_LIKE = /^[\w.-]+@[\w.-]+:/;
/** A package at a version (`evil@1.2.3`, `@scope/x@latest`, `example.com/x@latest`): something to download. */
const PACKAGE_AT = /^(@[\w.-]+\/)?[\w./-]+@[\w^~<>=*.-]+$/;
/** Package specifiers that name a registry rather than a file. */
const SPECIFIER = /(^|=)(npm|jsr|github|gitlab|bitbucket|git\+[a-z]+|https?):/i;
/** Long flags that run a command or code they're given, in any program (npm's, go's, git's, tar's, …). */
const EXEC_HOOK =
  /^--?(node-options|script-shell|shell|exec|toolexec|vettool|overlay)(=|$)|^--(to-command|checkpoint-action|use-compress-program|info-script|new-volume-script|unzip-command|open-files-in-pager|upload-pack|receive-pack|exec|ext-diff|eval|eval-command)(=|$)/i;
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
  if (/^(SHELL|\.SHELLFLAGS|MAKESHELL|MAKEFLAGS|MFLAGS|MAKE|GNUMAKEFLAGS)=/.test(arg))
    return `sets what make runs (${arg.split('=')[0]})`;
  if (SHELLISH.test(arg)) return 'carries a shell command (a pipe to a shell, $(…), backticks, ; or &&)';
  if (program === 'git' && /^(--output(=|$)|-o)/.test(arg)) return 'writes git output to a file it names';
  return undefined;
}

/** A command line inside one argument: a pipe into a shell or network tool, command substitution, chaining. */
const SHELLISH = /\|\s*(sh|bash|zsh|dash|ksh|fish|pwsh|node|python\d*|perl|ruby)\b|\$\(|`|;|&&|\|\||\b(curl|wget)\s/;

/** `cargo --config` given as inline `key=value` (a runner or wrapper), rather than a `.toml` file in the repo. */
function cargoConfigProblem(program: string, args: string[]): string | undefined {
  if (program !== 'cargo') return undefined;
  for (let i = 0; i < args.length; i++) {
    const value = args[i] === '--config' ? args[i + 1] : /^--config=(.*)$/s.exec(args[i])?.[1];
    if (value !== undefined && !/^[\w./-]+\.toml$/.test(value)) return 'sets cargo configuration inline (--config)';
  }
  return undefined;
}

/** The first problem among the arguments: argv that itself carries code or downloads code. */
export function argsProblem(program: string, args: string[]): string | undefined {
  const cargo = cargoConfigProblem(program, args);
  if (cargo) return cargo;
  for (const arg of args) {
    const p = argProblem(program, arg);
    if (p) return p;
  }
  return undefined;
}

/** Flags that give an unknown program code to run: refused for any program Teamtrail doesn't know. */
const GENERIC_CODE =
  /^(-c|-e|-E|-ex|-x|-r|-command|-Command|-EncodedCommand)$|^--(eval|exec|command|expr|execute|run)(=|$)/;

/** A host and path without a scheme (`evil.com/x`), as a tool that fetches would take it. */
const BARE_URL = /(^|[\s|'"=])[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(:\d+)?\/\S*/i;

/**
 * Why argv looks like it's given code to run, for any program: a flag that usually means "run this code", unless the
 * known shape says it's data for that tool (`exempt`), and for a program Teamtrail doesn't know, a bare host/path.
 */
export function genericCodeProblem(args: string[], known: { exempt?: string[] } | undefined): string | undefined {
  const flag = args.find((a) => GENERIC_CODE.test(a) && !known?.exempt?.includes(a.split('=')[0]));
  if (flag) return `passes ${flag.split('=')[0]}, which usually means "run this code"; point at a script in the repo`;
  if (!known && args.some((a) => BARE_URL.test(a))) return 'names an address, so it may reach the network';
  return undefined;
}
