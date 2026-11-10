import { spawn } from 'node:child_process';
import { mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { CheckResult, CheckSpec } from '../model/verification';
import { checkEnv, withheldNote } from './checkEnv';
import { redact, tailOf } from './redact';

/** Full output kept per check; the rest is dropped behind a marker. */
export const MAX_LOG_BYTES = 1_048_576;
const TAIL_BUFFER = 65_536;
const KILL_GRACE_MS = 5_000;

export interface CheckRun {
  /** Commands run here, or in `spec.cwd` below it; nothing outside. */
  repoRoot: string;
  /** Absolute directory for `<check>.log`. */
  logDir: string;
  /** The same directory as `CheckResult.log` shows it (relative to the tracker root). */
  logRel: string;
  /** Overrides `spec.timeoutSec`, so the attempt's total budget holds. */
  timeoutMs?: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
  killGraceMs?: number;
}

const safe = (s: string) => s.replace(/[^\w.-]/g, '_');

/** `spec.cwd` resolved through symlinks, or undefined when it leaves the repo. */
function confinedCwd(repoRoot: string, cwd = '.') {
  try {
    const root = realpathSync(repoRoot);
    const dir = realpathSync(path.resolve(root, cwd));
    return dir === root || dir.startsWith(root + path.sep) ? dir : undefined;
  } catch {
    return undefined;
  }
}

/** Kills the check and everything it started: its process group on POSIX, its tree on Windows. */
function killTree(pid: number, sig: NodeJS.Signals) {
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-pid, sig);
  } catch {
    // already gone
  }
}

/**
 * Runs one configured check: argv only (no shell), an allowlisted environment
 * (checkEnv.ts), the whole process tree killed on timeout. On Windows, commands
 * that are `.cmd` shims (npm, npx) must be named in full (`npm.cmd`).
 */
export function runCheck(name: string, spec: CheckSpec, run: CheckRun): Promise<CheckResult> {
  const started = Date.now();
  const log = `${run.logRel}/${safe(name)}.log`;
  const base = { name, argv: spec.run, log, timedOut: false, truncated: false };
  const cwd = confinedCwd(run.repoRoot, spec.cwd);
  if (!cwd) {
    const error = `cwd "${spec.cwd}" is not a directory inside the repo`;
    return Promise.resolve({ ...base, cwd: spec.cwd ?? '.', exitCode: null, durationMs: 0, error, tail: error });
  }
  const { env, withheld } = checkEnv(run.env ?? process.env);
  const chunks: Buffer[] = [];
  let kept = 0;
  let truncated = false;
  let tail = '';
  let timedOut = false;
  let aborted = false;
  let error: string | undefined;

  return new Promise((resolve) => {
    const child = spawn(spec.run[0], spec.run.slice(1), {
      cwd,
      env,
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const onData = (b: Buffer) => {
      tail = (tail + b.toString('utf8')).slice(-TAIL_BUFFER);
      if (kept >= MAX_LOG_BYTES) return void (truncated = true);
      const part = b.subarray(0, MAX_LOG_BYTES - kept);
      chunks.push(part);
      kept += part.length;
      if (part.length < b.length) truncated = true;
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);

    let graceTimer: NodeJS.Timeout | undefined;
    const stop = () => {
      if (!child.pid) return;
      killTree(child.pid, 'SIGTERM');
      graceTimer = setTimeout(() => child.pid && killTree(child.pid, 'SIGKILL'), run.killGraceMs ?? KILL_GRACE_MS);
    };
    const timeoutMs = run.timeoutMs ?? spec.timeoutSec * 1000;
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutMs);
    const onAbort = () => {
      aborted = true;
      stop();
    };
    run.signal?.addEventListener('abort', onAbort, { once: true });
    if (run.signal?.aborted) onAbort();

    let exit: { code: number | null; signal: NodeJS.Signals | null } | undefined;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(graceTimer);
      run.signal?.removeEventListener('abort', onAbort);
      let text = Buffer.concat(chunks).toString('utf8');
      if (truncated) text += `\n[truncated: output over ${MAX_LOG_BYTES} bytes]\n`;
      if (aborted) error = 'cancelled';
      if (exit?.code !== 0) text += withheldNote(withheld);
      try {
        mkdirSync(run.logDir, { recursive: true });
        writeFileSync(path.join(run.logDir, `${safe(name)}.log`), redact(text));
      } catch {
        // a check result without its log is still a result
      }
      const note = timedOut ? `\n[timed out after ${Math.round(timeoutMs / 1000)} s]` : '';
      resolve({
        ...base,
        cwd: path.relative(realpathSync(run.repoRoot), cwd) || '.',
        exitCode: exit?.code ?? null,
        ...(exit?.signal ? { signal: exit.signal } : {}),
        timedOut,
        durationMs: Date.now() - started,
        ...(error ? { error } : {}),
        tail: tailOf(tail + note) || (error ?? ''),
        truncated,
      });
    };
    child.on('error', (e) => {
      error ??= e.message;
      if (!exit) finish();
    });
    child.on('exit', (code, signal) => {
      exit = { code, signal };
      // leftovers (a backgrounded server, a stuck watcher) go with the check
      if (child.pid && process.platform !== 'win32') killTree(child.pid, 'SIGKILL');
    });
    child.on('close', finish);
  });
}

export const checkPassed = (r: CheckResult) => r.exitCode === 0 && !r.timedOut && !r.error;
