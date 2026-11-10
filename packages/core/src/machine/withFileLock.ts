import { readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { processAlive } from '../lib/processAlive';

const STALE_MS = 10_000;
const WAIT_MS = 3_000;
const pause = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** Removes a lock whose holder is gone or that is older than a write could take; true when it was. */
function clearStale(lock: string): boolean {
  try {
    const pid = Number(readFileSync(lock, 'utf8'));
    const old = Date.now() - statSync(lock).mtimeMs > STALE_MS;
    if (processAlive(pid) && !old) return false;
    rmSync(lock, { force: true });
    return true;
  } catch {
    return true;
  }
}

/**
 * Runs `fn` while holding `lock`, a file created exclusively, so a read-modify-write by one process (the Lookout,
 * an MCP server, the CLI) never loses another's change. A lock left by a dead process is taken over. Synchronous,
 * like the writes it guards; waits at most a few seconds, then throws.
 */
export function withFileLock<T>(lock: string, fn: () => T): T {
  const until = Date.now() + WAIT_MS;
  for (;;) {
    try {
      writeFileSync(lock, String(process.pid), { flag: 'wx', mode: 0o600 });
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      if (clearStale(lock)) continue;
      if (Date.now() > until) throw new Error(`${lock} is held by another process`, { cause: e });
      pause(20);
    }
  }
  try {
    return fn();
  } finally {
    rmSync(lock, { force: true });
  }
}
