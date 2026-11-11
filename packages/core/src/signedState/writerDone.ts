import { existsSync } from 'node:fs';
import { stateRecordFile } from './stateRecord';

/** How long a read waits for a write in progress; a write takes milliseconds, a lock held longer is someone's bug. */
const WAIT_MS = 3_000;
const POLL_MS = 10;

/**
 * Resolves once no Teamtrail process is writing the trail (its record's lock, stateRecord.ts, is free), or after a
 * few seconds. A write renames the tracker file in before it signs it, both under that lock: a read in between sees
 * Teamtrail's own change as made outside it. Never blocks: other requests go on while it waits.
 */
export async function writerDone(root: string, mapId: string): Promise<void> {
  let lock: string;
  try {
    lock = `${stateRecordFile(root, mapId)}.lock`;
  } catch {
    return;
  }
  const until = Date.now() + WAIT_MS;
  while (existsSync(lock) && Date.now() < until) await new Promise((done) => setTimeout(done, POLL_MS));
}
