import { spawn } from 'node:child_process';
import { filterOverrides, gitEnv, SAFE_CONFIG, type ConfigPair } from './safeGit';

const GIT_TIMEOUT_MS = 30_000;

export interface GitResult {
  code: number | null;
  stdout: Buffer;
  stderr: string;
}

/** Subcommands that only read refs, objects or config: git runs no content filter for them. */
const NO_FILTERS = /^(rev-parse|symbolic-ref|merge-base|cat-file|config|show-ref)$/;

const UNREADABLE =
  "Teamtrail couldn't read this repository's git config, so it won't run git here: it can't tell which filters the config would run. Check `git config --list --show-scope` in this repo.";

/** What each subcommand gets on top of its own arguments: no program the repo names, no submodule entered. */
function guarded(args: string[]) {
  const [cmd, ...rest] = args;
  if (cmd === 'diff') return [cmd, '--no-ext-diff', '--no-textconv', '--ignore-submodules=all', ...rest];
  if (cmd === 'status') return [cmd, '--ignore-submodules=all', ...rest];
  return args;
}

/**
 * Runs `git` without a shell; never throws (a missing binary is code `null`). Every call gets the scrubbed
 * environment and the config overrides of safeGit.ts, so nothing the repo's own config names is run. Calls that
 * read the working tree first ask the repo which content filters it defines and empty those too; when that
 * question fails, git isn't run at all (fail closed). Diffs run no external diff or textconv, and nothing
 * enters a submodule.
 */
export async function git(cwd: string, args: string[], input?: string): Promise<GitResult> {
  if (NO_FILTERS.test(args[0] ?? '')) return run({ cwd, args, input, config: SAFE_CONFIG });
  const listing = await run({
    cwd,
    args: ['config', '--show-scope', '-z', '--get-regexp', '^filter\\.'],
    config: SAFE_CONFIG,
  });
  // 0: some filters, 1: none. Anything else (a config git can't parse, a missing binary) is not "none".
  if (listing.code !== 0 && listing.code !== 1)
    return { code: listing.code ?? 128, stdout: Buffer.alloc(0), stderr: UNREADABLE };
  const filters = listing.code === 0 ? filterOverrides(listing.stdout.toString('utf8')) : [];
  return run({ cwd, args: guarded(args), input, config: [...SAFE_CONFIG, ...filters] });
}

function run(o: { cwd: string; args: string[]; input?: string; config: ConfigPair[] }): Promise<GitResult> {
  const { cwd, args, input } = o;
  return new Promise((resolve) => {
    const out: Buffer[] = [];
    let err = '';
    const child = spawn('git', args, {
      cwd,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: gitEnv(o.config),
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), GIT_TIMEOUT_MS);
    child.stdout.on('data', (b: Buffer) => out.push(b));
    child.stderr.on('data', (b: Buffer) => (err += b.toString('utf8')));
    child.stdin.on('error', () => {});
    child.stdin.end(input ?? '');
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: null, stdout: Buffer.alloc(0), stderr: e.message });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(out), stderr: err });
    });
  });
}

/** stdout as text when git succeeds, else undefined. */
export async function gitText(cwd: string, args: string[], input?: string) {
  const r = await git(cwd, args, input);
  return r.code === 0 ? r.stdout.toString('utf8').trim() : undefined;
}

/** NUL-separated stdout (`-z` output) as a list. */
export const zList = (b: Buffer) => b.toString('utf8').split('\0').filter(Boolean);
