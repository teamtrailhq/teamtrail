import { readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import path from 'node:path';
import { machineStore } from '../../machine/machineStore';
import { writePrivateFile } from '../../machine/writePrivateFile';
import { isQueuedWrite } from './sync/isQueuedWrite';
import type { OutboxStore, QueuedWrite } from './sync/types';
import type { RemoteKind } from './types';

/*
 * Queued tracker writes on disk, so they survive an exit or crash:
 *   <config dir>/projects/<project id>/outbox/<kind>-<target>.<pid>-<n>.json    one file per live adapter, 0600
 * A file whose process is gone (or whose adapter was disposed) is adopted by
 * the next adapter for the same tracker and target: it is claimed with an
 * atomic rename, so two processes starting together never both replay it.
 *
 * The queue is sent with the user's tracker token, whatever it says, so it lives outside the repo
 * (machine/machineStore.ts): only Teamtrail on this machine writes there, after the write passed its gates. Earlier
 * versions kept it in `<tracker dir>/.outbox/`, where an agent or a push could plant a file. That folder is never
 * read again.
 */
export const OUTBOX_DIR = '.outbox';

/** Where a project's queued writes live on this machine. */
export const outboxDir = (root: string, configDir?: string) => path.join(machineStore(root, configDir).dir, 'outbox');

export const isOutboxPath = (rel: string) =>
  rel === OUTBOX_DIR || rel.startsWith(`${OUTBOX_DIR}/`) || rel.startsWith(`${OUTBOX_DIR}\\`);

/** `github-owner_name`, `linear-<team>[-<project>]`: a queue only replays into the tracker it was written for. */
export function outboxKey(kind: RemoteKind, ...target: (string | undefined)[]) {
  return [kind, ...target.filter(Boolean)]
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
}

/** Adapters of this process that own their file. */
const live = new Set<string>();
let instances = 0;

const OWNER = /^(\d+)-(\d+)(?:\.claim-\d+)?$/;

function alive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function owned(owner: string) {
  const m = owner.match(OWNER);
  if (!m) return false;
  return Number(m[1]) === process.pid ? live.has(`${m[1]}-${m[2]}`) : alive(Number(m[1]));
}

/** Queue files for `key` that no live adapter owns. */
function orphans(dir: string, key: string) {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((n) => n.startsWith(`${key}.`) && n.endsWith('.json') && !owned(n.slice(key.length + 1, -'.json'.length)))
    .sort();
}

function readWrites(file: string): QueuedWrite[] {
  try {
    const doc = JSON.parse(readFileSync(file, 'utf8')) as {
      v?: number;
      writes?: QueuedWrite[];
    };
    return doc.v === 1 && Array.isArray(doc.writes) ? doc.writes.filter(isQueuedWrite) : [];
  } catch {
    return [];
  }
}

/** Unsent writes left for `key` by earlier runs (shown before an adapter adopts them). */
export function orphanedWrites(dir: string, key: string) {
  return orphans(dir, key).reduce((n, f) => n + readWrites(path.join(dir, f)).length, 0);
}

/** The queue of one adapter in `dir` (see `outboxDir`). */
export function outboxFile(dir: string, key: string): OutboxStore & { file: string } {
  const owner = `${process.pid}-${++instances}`;
  const file = path.join(dir, `${key}.${owner}.json`);
  let released = false;

  const save = (writes: QueuedWrite[]) => {
    if (released) return;
    if (!writes.length) return void rmSync(file, { force: true });
    writePrivateFile(file, JSON.stringify({ v: 1, writes }, null, 2) + '\n');
  };

  return {
    file,
    load() {
      live.add(owner);
      const claimed: string[] = [];
      for (const [i, name] of orphans(dir, key).entries()) {
        const to = path.join(dir, `${key}.${owner}.claim-${i}.json`);
        try {
          renameSync(path.join(dir, name), to);
          claimed.push(to);
        } catch {
          // another process claimed it first
        }
      }
      const seen = new Set<string>();
      const writes = claimed
        .flatMap(readWrites)
        .filter((w) => !seen.has(w.id) && seen.add(w.id))
        .sort((a, b) => a.at - b.at);
      save(writes);
      for (const f of claimed) rmSync(f, { force: true });
      return writes;
    },
    save,
    release() {
      released = true;
      live.delete(owner);
    },
  };
}
