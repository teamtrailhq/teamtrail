/** Programs a proposed check may not start with, by base name (programOf). */
export const SHELLS = new Set([
  'sh',
  'bash',
  'zsh',
  'fish',
  'dash',
  'ksh',
  'csh',
  'tcsh',
  'ash',
  'cmd',
  'powershell',
  'pwsh',
]);

export const NETWORK_TOOLS = new Set([
  'curl',
  'wget',
  'nc',
  'ncat',
  'netcat',
  'socat',
  'telnet',
  'scp',
  'sftp',
  'ssh',
  'rsync',
  'ftp',
  'aria2c',
]);

/** Download a package and run it. */
export const RUNNERS = new Set(['npx', 'pnpx', 'bunx']);

/** Run another program, named in their arguments, so the check is really that program. */
export const WRAPPERS = new Set([
  'env',
  'xargs',
  'sudo',
  'doas',
  'su',
  'nohup',
  'nice',
  'time',
  'timeout',
  'watch',
  'stdbuf',
  'chroot',
  'exec',
  'eval',
  'command',
  'busybox',
  'parallel',
  'script',
  'awk',
  'gawk',
  'mawk',
  'nawk',
]);

/** Package-manager subcommands that download (and may run) packages. */
const DOWNLOADS = ['exec', 'x', 'dlx', 'install', 'i', 'add', 'ci', 'create', 'init', 'update', 'upgrade'];
export const PACKAGE_MANAGERS: Record<string, Set<string>> = {
  npm: new Set(DOWNLOADS),
  pnpm: new Set(DOWNLOADS),
  yarn: new Set(DOWNLOADS),
  bun: new Set(DOWNLOADS),
  pip: new Set(['install', 'download']),
  pip3: new Set(['install', 'download']),
  gem: new Set(['install']),
  cargo: new Set(['install']),
  go: new Set(['install', 'get']),
  deno: new Set(['eval', 'install']),
};

/**
 * A program's name as it runs: the base name of a path, lower case, without `.exe`, `.cmd` or `.bat`, and without a
 * version (`python3.12` → `python`, `node22` → `node`), so a path or a suffix doesn't hide what it is.
 */
export function programOf(argv0: string): string {
  const base = (argv0.split(/[\\/]/).pop() ?? '').toLowerCase().replace(/\.(exe|cmd|bat|com)$/, '');
  const unversioned = base.replace(/(?<=[a-z])[\d.-]+$/, '');
  return unversioned || base;
}
