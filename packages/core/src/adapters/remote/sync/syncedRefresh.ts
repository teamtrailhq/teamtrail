import { isTransient, TrackerError } from '../http';
import { listsDiffer } from './listedTrails';
import { isNotFound, SyncedStore } from './syncedStore';
import type { SyncOptions } from './types';

/** How often every cached trail and the trail list are read again, whatever the change list said. */
const RESYNC_MS = 5 * 60_000;

const rateLimited = (e: unknown) => e instanceof TrackerError && e.code === 'rate_limited';

/**
 * The poll's read side: asks the tracker what changed, then reads those trails again. A trail stays pending until
 * a read of it succeeds, so a failed poll (offline, rate limited, one trail that can't be read) loses nothing and
 * never holds up the others. Every few minutes everything is read again, which is what shows what no change list
 * reports: a deleted or transferred issue, a write the tracker refused, a teammate who lost access.
 */
export abstract class SyncedRefresh extends SyncedStore {
  /** Trails changed in the tracker since the last call; `'all'` when the trail list itself may have changed. */
  protected abstract changedSince(known: (issueRef: string) => string | undefined): Promise<string[] | 'all'>;

  private readonly resyncMs: number;
  private lastResync: number;
  /** The trail list must be read again (it may have changed) and hasn't been yet. */
  private relistDue = false;

  constructor(opts: SyncOptions = {}) {
    super(opts);
    this.resyncMs = opts.resyncMs ?? RESYNC_MS;
    this.lastResync = this.now();
  }

  protected async sync() {
    const index = new Map<string, string>();
    for (const [mapId, e] of this.entries) {
      index.set(mapId, mapId);
      for (const t of e.snap.tickets) index.set(t.id, mapId);
    }
    const changed = await this.changedSince((ref) => index.get(ref));
    this.health.online();
    const resync = this.now() - this.lastResync >= this.resyncMs;
    if (changed === 'all' || resync) this.relistDue = true;
    const ids = changed === 'all' || resync ? [...this.entries.keys()] : changed;
    for (const id of ids) if (this.entries.has(id)) this.pending.add(id);
    if (resync) this.lastResync = this.now();
    if (this.relistDue) await this.relist();
    await this.readPending();
  }

  private async relist() {
    const list = await this.fetchMaps();
    const changed = listsDiffer(this.maps?.list, list);
    this.maps = { list, at: this.now() };
    this.relistDue = false;
    // a cached trail the list no longer names may be gone: reading it again tells
    for (const id of this.entries.keys()) if (!list.some((m) => m.id === id)) this.pending.add(id);
    if (changed) this.emit({ kind: 'external.changed' });
  }

  /** Reads every pending trail; the first failure is reported after the others had their turn. */
  private async readPending() {
    let failure: unknown;
    for (const id of [...this.pending]) {
      // queued writes go first; until they're sent, a read would show the tracker without them
      if (this.queue.length) break;
      try {
        await this.reread(id);
      } catch (err) {
        if (isNotFound(err)) continue;
        failure ??= err;
        if (rateLimited(err)) break;
      }
    }
    if (failure === undefined) return;
    // offline or rate limited: the poll backs off; anything else stays pending and shows, the other trails went on
    if (isTransient(failure)) throw failure;
    this.health.failed(failure);
  }
}
