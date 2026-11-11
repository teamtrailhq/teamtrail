import { readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { writePrivateFile } from '../../machine/writePrivateFile';
import { OUTBOX_DIR } from './outboxFile';
import { isQueuedWrite } from './sync/isQueuedWrite';
import type { QueuedWrite } from './sync/types';

/** A queue file's tracker target: everything before its owner (`<kind>-<target>.<owner>.json`). */
const targetOf = (name: string) => name.replace(/\.[^.]*\.json$/, '');

function readQueue(file: string): QueuedWrite[] {
  try {
    const doc = JSON.parse(readFileSync(file, 'utf8')) as { v?: number; writes?: unknown[] };
    return doc.v === 1 && Array.isArray(doc.writes) ? doc.writes.filter(isQueuedWrite) : [];
  } catch {
    return [];
  }
}

/**
 * Writes queued in `<tracker dir>/.outbox/` by a version that kept the queue in the repo. A file there could have
 * been written by anyone who can write the repo, so it is never sent on its own: the trail lead sees what is in it
 * (how many writes, for which tracker, their labels) and sends it, which moves it to this machine's queue, or
 * discards it.
 */
export function legacyOutbox(root: string) {
  const dir = path.join(root, OUTBOX_DIR);
  const files = () => {
    try {
      return readdirSync(dir).filter((n) => n.endsWith('.json'));
    } catch {
      return [];
    }
  };
  return {
    list() {
      const names = files();
      const writes = names.flatMap((n) => readQueue(path.join(dir, n)));
      return { writes: writes.length, targets: [...new Set(names.map(targetOf))], labels: writes.map((w) => w.label) };
    },
    /** Moves every queue into `queueDir` (this machine's), where the tracker adapter for its target sends it. */
    send(queueDir: string) {
      files().forEach((n, i) => {
        const writes = readQueue(path.join(dir, n));
        if (writes.length)
          writePrivateFile(path.join(queueDir, `${targetOf(n)}.legacy-${i}.json`), JSON.stringify({ v: 1, writes }));
        rmSync(path.join(dir, n), { force: true });
      });
    },
    discard() {
      for (const n of files()) rmSync(path.join(dir, n), { force: true });
    },
  };
}
