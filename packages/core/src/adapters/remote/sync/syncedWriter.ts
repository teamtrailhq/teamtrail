import { isTransient, type TrackerError } from '../http';
import { applyWrite, CHECKED, hasLanded, writeId } from './queuedWrites';
import { SyncedSend } from './syncedSend';
import type { CacheEntry, EventInit, QueuedChange, QueuedWrite } from './types';

/**
 * Write side of a synced adapter: the queue that sends writes in order (or holds them while the tracker is
 * unreachable). The remote primitives are in `SyncedSend`; the public write methods are added by `SyncedAdapter`.
 */
export abstract class SyncedWriter extends SyncedSend {
  private writes = 0;

  protected async flush() {
    /** Uncached remote state read during this flush, to check writes that may have landed. */
    const remote = new Map<string, CacheEntry>();
    const read = async (mapId: string) => {
      let r = remote.get(mapId);
      if (!r) {
        r = await this.fetchEntry(mapId);
        remote.set(mapId, r);
        if (!this.entries.has(mapId)) this.entries.set(mapId, this.withQueued(mapId, r));
      }
      return r;
    };
    for (let w = this.queue.head; w; w = this.queue.head) {
      try {
        const check = w.verify && CHECKED.has(w.change.kind);
        if (check || !this.entries.has(w.mapId)) await read(w.mapId);
        if (!(check && hasLanded(remote.get(w.mapId)!, w))) await this.send(await this.entry(w.mapId), w);
        this.touch(w.mapId);
      } catch (err) {
        if (isTransient(err)) throw this.keepQueued(w, err);
        this.drop(w, err);
        continue;
      }
      this.queue.shift();
      this.health.online();
      this.health.set({});
    }
  }

  /**
   * The tracker rejected a queued write for good (deleted issue, revoked access, claimed meanwhile): it is dropped
   * rather than block the queue, kept in the status and for the human (the `tracker-refused` attention item, until
   * they retry or discard it), and its trail read again so the cache stops showing it.
   */
  private drop(w: QueuedWrite, err: unknown) {
    this.queue.shift();
    const error = String((err as Error)?.message ?? err);
    let failed: Error | undefined;
    try {
      this.refused?.add({ write: w, error, at: this.now() });
    } catch (e) {
      failed = e as Error;
    }
    const kept = this.refused && !failed;
    this.health.dropped({ id: kept ? w.id : undefined, label: w.label, error });
    if (failed) this.health.note(`Could not keep the refused write (${w.label}): ${failed.message}`);
    this.pending.add(w.mapId);
    const cached = this.entries.get(w.mapId);
    if (cached) cached.at = 0;
  }

  /**
   * Leaves a write that hit a transient failure in the queue. An offline failure
   * may have reached the tracker anyway, so the write is checked before it is sent again.
   */
  private keepQueued(w: QueuedWrite, err: TrackerError): TrackerError {
    if (err.code === 'offline' && !w.verify) {
      w.verify = true;
      this.queue.save();
    }
    return err;
  }

  /**
   * Sends one queueable write and applies it to the cache. When the tracker is
   * offline or rate limited (or other writes are queued, to keep order) it is
   * applied to the cache now and queued, persisted when there is a store.
   */
  protected async change(
    mapId: string,
    label: string,
    change: QueuedChange | ((e: CacheEntry) => QueuedChange),
    event: EventInit,
  ) {
    await this.locks.run(mapId, async () => {
      const e = await this.entry(mapId);
      const c = typeof change === 'function' ? change(e) : change;
      const author = this.author?.();
      const w: QueuedWrite = {
        id: writeId(mapId, c, this.now, ++this.writes),
        mapId,
        label,
        at: this.now(),
        change: c,
        ...(author ? { by: author.by, ...(author.origin ? { origin: author.origin } : {}) } : {}),
      };
      this.touch(mapId);
      const current = await this.sendOrQueue(e, w);
      applyWrite(e, w, this.now);
      e.at = this.now();
      e.snap.map.updatedAt = this.now();
      // the trail as the tracker had it just before, with this write: what a teammate changed meanwhile shows now
      if (current) {
        applyWrite(current, w, this.now);
        current.snap.map.updatedAt = this.now();
        this.replace(mapId, current);
      }
      this.touch(mapId);
      this.emit(event);
    });
  }

  /** Sends `w` now, or queues it behind other queued writes or when the tracker can't be reached. */
  private async sendOrQueue(e: CacheEntry, w: QueuedWrite): Promise<CacheEntry | undefined> {
    if (this.queue.length) return void this.enqueue(w);
    try {
      const current = await this.send(e, w);
      this.health.online();
      return current;
    } catch (err) {
      this.health.failed(err);
      if (!isTransient(err)) throw err;
      this.enqueue({ ...w, verify: err.code === 'offline' || undefined });
      return undefined;
    }
  }

  private enqueue(w: QueuedWrite) {
    this.queue.push(w);
    this.health.set({});
    const s = this.health.status;
    this.poller.schedule(
      s.state === 'rate-limited' && s.resetAt ? Math.max(1000, s.resetAt - this.now()) : Math.min(this.pollMs, 5000),
    );
  }
}
