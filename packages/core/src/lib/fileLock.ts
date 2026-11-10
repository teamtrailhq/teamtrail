import { closeSync, openSync, rmSync, statSync, writeSync } from 'node:fs';

const STALE_MS = 10_000;
const WAIT_MS = 15_000;
const pause = new Int32Array(new SharedArrayBuffer(4));

/**
 * Runs `fn` while holding `<file>.lock`, created exclusively (`wx`), so a read-modify-write of `file` by
 * several processes (the Lookout, `teamtrail mcp`, `connect slack`) never loses one of them. A lock older than
 * ten seconds belongs to a process that died holding it and is taken over. Synchronous, like the stores
 * that use it; waits at most fifteen seconds, then throws.
 */
export function withFileLock<T>(file: string, fn: () => T): T {
  const lock = `${file}.lock`;
  const until = Date.now() + WAIT_MS;
  for (;;) {
    try {
      const fd = openSync(lock, 'wx', 0o600);
      writeSync(fd, String(process.pid));
      closeSync(fd);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      if (staleLock(lock)) rmSync(lock, { force: true });
      else if (Date.now() > until) throw new Error(`${file} is locked by another process`);
      else Atomics.wait(pause, 0, 0, 5);
    }
  }
  try {
    return fn();
  } finally {
    rmSync(lock, { force: true });
  }
}

function staleLock(lock: string) {
  try {
    return Date.now() - statSync(lock).mtimeMs > STALE_MS;
  } catch {
    return false;
  }
}
