import { randomBytes } from 'node:crypto';
import { closeSync, linkSync, openSync, readFileSync, renameSync, rmSync, statSync, writeSync } from 'node:fs';

const STALE_MS = 10_000;
const WAIT_MS = 15_000;
const pause = new Int32Array(new SharedArrayBuffer(4));

/** A name of this process's own for a lock file it moves aside: nobody else ever uses it. */
const aside = (lock: string) => `${lock}.${process.pid}.${randomBytes(6).toString('hex')}`;

/**
 * Moves `lock` aside and deletes it only if it is the file `keep` says (the stale one we saw, or ours). Anything
 * else was put there by another process in between: it goes back, so its holder keeps its lock. Renaming is
 * atomic, so of several processes doing this at once only one gets the file.
 *
 * One window stays open, and is accepted: if a lock was taken over by someone else between our check and our
 * rename, it is aside for the instant before it goes back, and a third process may take the lock in that
 * instant; the holder whose lock we moved then loses it while it still works. It needs three processes on the
 * same file within milliseconds of a ten-second-old lock; what it can cost is one lost change to
 * credentials.json, not a credential leak. Closing it needs an OS lock Node has no synchronous call for.
 */
function removeIf(lock: string, keep: (moved: string) => boolean) {
  const moved = aside(lock);
  try {
    renameSync(lock, moved);
  } catch {
    return;
  }
  if (keep(moved)) return void rmSync(moved, { force: true });
  try {
    linkSync(moved, lock);
  } catch {
    // someone holds the lock again by now; theirs stays
  }
  rmSync(moved, { force: true });
}

/** Our lock goes; one that isn't ours any more (we were thought dead and taken over) is not even moved. */
function release(lock: string, token: string) {
  const mine = (p: string) => {
    try {
      return readFileSync(p, 'utf8') === token;
    } catch {
      return false;
    }
  };
  if (mine(lock)) removeIf(lock, mine);
}

const inode = (p: string) => {
  try {
    const st = statSync(p);
    return { ino: st.ino, old: Date.now() - st.mtimeMs > STALE_MS };
  } catch {
    return undefined;
  }
};

/**
 * Runs `fn` while holding `<file>.lock`, created exclusively (`wx`), so a read-modify-write of `file` by
 * several processes (the Lookout, `teamtrail mcp`, `connect slack`) never loses one of them. A lock older than
 * ten seconds belongs to a process that died holding it and is taken over, by rename (removeIf). Synchronous,
 * like the stores that use it; waits at most fifteen seconds, then throws.
 */
export function withFileLock<T>(file: string, fn: () => T): T {
  const lock = `${file}.lock`;
  const token = `${process.pid}.${randomBytes(8).toString('hex')}`;
  const until = Date.now() + WAIT_MS;
  for (;;) {
    try {
      const fd = openSync(lock, 'wx', 0o600);
      writeSync(fd, token);
      closeSync(fd);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      const seen = inode(lock);
      if (seen?.old) removeIf(lock, (moved) => statSync(moved).ino === seen.ino);
      else if (Date.now() > until) throw new Error(`${file} is locked by another process`);
      else Atomics.wait(pause, 0, 0, 5);
    }
  }
  try {
    return fn();
  } finally {
    release(lock, token);
  }
}
