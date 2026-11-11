/*
 * Programs a proposed check may never start with, by base name (programOf). These are errors whatever their
 * arguments; anything not in knownChecks.ts that isn't refused here needs the person's acknowledgement instead.
 */
const set = (words: string) => new Set(words.split(/\s+/).filter(Boolean));

export const SHELLS = set(`
  sh bash zsh fish dash ksh mksh pdksh csh tcsh ash yash nu nushell xonsh elvish osh oil rc es ion
  cmd powershell pwsh
`);

export const NETWORK_TOOLS = set(`
  curl wget nc ncat netcat socat telnet scp sftp ssh ssh-keyscan rsync ftp tftp aria2c websocat
  openssl dig nslookup host ping ping6 traceroute whois nmap gh aws gcloud az kubectl
`);

/** Download a package (or an image) and run it. */
export const RUNNERS = set('npx pnpx bunx uvx uv pipx docker podman nix nix-shell nix-env flatpak snap');

/** Run another program or command named in their arguments, so the check is really that. */
export const WRAPPERS = set(`
  env xargs sudo doas su nohup nice ionice time timeout watch stdbuf chroot setsid caffeinate arch flock unbuffer
  chronic firejail systemd-run strace ltrace gdb lldb exec eval command busybox toybox parallel script
  awk gawk mawk nawk sed gsed vim nvim vi ex emacs expect
`);

/** Package-manager subcommands that download (and may run) packages, wherever they come after the flags. */
const DOWNLOADS = ['exec', 'x', 'dlx', 'install', 'i', 'add', 'ci', 'create', 'init', 'update', 'upgrade'];
export const PACKAGE_MANAGERS: Record<string, Set<string>> = {
  npm: new Set(DOWNLOADS),
  pnpm: new Set(DOWNLOADS),
  yarn: new Set(DOWNLOADS),
  bun: new Set(DOWNLOADS),
  pip: new Set(['install', 'download', 'wheel']),
  gem: new Set(['install', 'exec']),
  cargo: new Set(['install', 'binstall']),
  go: new Set(['install', 'get']),
  deno: new Set(['eval', 'install']),
  bundle: new Set(['install', 'exec']),
  composer: new Set(['install', 'require', 'global', 'exec']),
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
