/** git subcommands that reach a remote, change git's configuration or run what it names. */
const NETWORK = new Set([
  'push',
  'fetch',
  'pull',
  'clone',
  'remote',
  'submodule',
  'config',
  'ls-remote',
  'send-email',
  'request-pull',
  'daemon',
  'http-fetch',
  'http-push',
  'credential',
  'archive',
  'bundle',
  'svn',
  'p4',
  'lfs',
  'filter-branch',
  'bisect',
  'difftool',
  'mergetool',
]);

/** Global options that take the next argument as their value. */
const TAKES_VALUE = new Set(['-C', '--git-dir', '--work-tree', '--namespace', '--super-prefix']);

/**
 * Why a `git …` check is unsafe, if it is: `-c` and `--config-env` set configuration inline (an ssh command, a hook
 * path), `--exec-path` swaps git's own programs, and some subcommands reach a remote or run what they're given.
 * Global options before the subcommand are skipped the way git reads them, so `git -C . push` is still a push.
 */
export function gitProblem(args: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const name = arg.split('=')[0];
    if (name === '-c' || name.startsWith('-c') || name === '--config-env' || name === '--exec-path')
      return `sets git's configuration or programs inline (${name})`;
    if (TAKES_VALUE.has(name)) {
      if (!arg.includes('=')) i++;
      continue;
    }
    if (arg.startsWith('-')) continue;
    const sub = arg.toLowerCase();
    return NETWORK.has(sub) ? `runs git ${sub}, which reaches a remote or changes git's configuration` : undefined;
  }
  return undefined;
}
