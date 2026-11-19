import { mkdirSync } from 'node:fs';
import { machineStore } from '../../machine/machineStore';
import { withFileLock } from '../../machine/withFileLock';
import { isQueuedWrite } from './sync/isQueuedWrite';
import type { RefusedWrite } from './sync/types';

/*
 * Writes GitHub or Linear refused for good (lost access, a deleted issue, a validation error, a body too large), kept
 * until the trail lead retries or discards them:
 *   <config dir>/projects/<project id>/tracker-refused.json   `{ v: 1, writes: RefusedWrite[] }`, 0600
 * Every process that sends tracker writes (the Lookout, each MCP server) adds to it, under a file lock. It lives in
 * the machine store, never the repo: Retry sends the write again with this machine's token, so nothing an agent or a
 * push can write may put a write there.
 */
export const REFUSED_FILE = 'tracker-refused.json';

/** The most kept; the oldest go first. */
const MAX_KEPT = 100;

const isRefusedWrite = (r: unknown): r is RefusedWrite => {
  const v = r as RefusedWrite;
  if (!v || typeof v !== 'object' || !isQueuedWrite(v.write)) return false;
  const known = v.tracker === 'github' || v.tracker === 'linear';
  return known && typeof v.key === 'string' && typeof v.error === 'string' && typeof v.at === 'number';
};

/** The refused writes of one project on this machine. Reads never throw: an unreadable store holds none. */
export function refusedWrites(root: string, configDir?: string) {
  const store = machineStore(root, configDir);
  const lock = store.file(`${REFUSED_FILE}.lock`);
  const read = (): RefusedWrite[] => {
    try {
      const doc = store.read<{ v?: number; writes?: unknown[] }>(REFUSED_FILE);
      return doc?.v === 1 && Array.isArray(doc.writes) ? doc.writes.filter(isRefusedWrite) : [];
    } catch {
      return [];
    }
  };
  const update = (change: (all: RefusedWrite[]) => RefusedWrite[]) => {
    mkdirSync(store.dir, { recursive: true, mode: 0o700 });
    withFileLock(lock, () => {
      const writes = change(read());
      if (writes.length) store.write(REFUSED_FILE, { v: 1, writes });
      else store.remove(REFUSED_FILE);
    });
  };
  return {
    list: read,
    /** Keeps one refusal; the same write refused again replaces its earlier refusal. */
    add(r: RefusedWrite) {
      update((all) => [...all.filter((x) => x.write.id !== r.write.id), r].slice(-MAX_KEPT));
    },
    /** Removes the writes with these ids and returns them as they were kept. */
    take(ids: string[]): RefusedWrite[] {
      const wanted = new Set(ids);
      let taken: RefusedWrite[] = [];
      update((all) => {
        taken = all.filter((r) => wanted.has(r.write.id));
        return all.filter((r) => !wanted.has(r.write.id));
      });
      return taken;
    },
  };
}
