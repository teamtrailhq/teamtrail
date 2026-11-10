import { spawn } from 'node:child_process';
import { filterOverrides, gitEnv, safeConfigArgs } from './safeGit';

const GIT_TIMEOUT_MS = 30_000;

export interface GitResult {
  code: number | null;
  stdout: Buffer;
  stderr: string;
}

/** Subcommands that only read refs, objects or config: git runs no content filter for them. */
const NO_FILTERS = /^(rev-parse|symbolic-ref|merge-base|cat-file|config)$/;

/**
 * Runs `git` without a shell; never throws (a missing binary is code `null`). Every call gets the scrubbed
 * environment and the config overrides of safeGit.ts, so nothing the repo's own config names is run; calls that
 * read the working tree first ask the repo which content filters it defines, and empty those too; a diff never
 * runs an external diff or textconv program.
 */
export async function git(cwd: string, args: string[], input?: string): Promise<GitResult> {
  const safe = safeConfigArgs();
  if (NO_FILTERS.test(args[0] ?? '')) return run(cwd, [...safe, ...args], input);
  const listing = await run(cwd, [...safe, 'config', '--show-scope', '-z', '--get-regexp', '^filter\\.']);
  const filters = listing.code === 0 ? safeConfigArgs(filterOverrides(listing.stdout.toString('utf8'))) : [];
  // A diff never goes through a program the repo names: no external diff, no textconv.
  const guarded = args[0] === 'diff' ? ['diff', '--no-ext-diff', '--no-textconv', ...args.slice(1)] : args;
  return run(cwd, [...safe, ...filters, ...guarded], input);
}

function run(cwd: string, args: string[], input?: string): Promise<GitResult> {
  return new Promise((resolve) => {
    const out: Buffer[] = [];
    let err = '';
    const child = spawn('git', args, {
      cwd,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
      env: gitEnv(),
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
