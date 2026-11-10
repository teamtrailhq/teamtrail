import type { DecisionRecord, MapDoc, MapMode, Ticket, TicketType } from '../../../model/types';
import { OperationError } from '../../../planning/operations/operationError';
import type { MapInput } from '../../adapter';
import { withMapMeta } from '../../mapMeta';
import { reopened, withEdit } from '../../ticketEdits';
import { withMeta } from '../../ticketMeta';
import { isTransient, type TrackerError } from '../http';
import { applyWrite, CHECKED, hasLanded, ticketOf, writeId } from './queuedWrites';
import { SyncedStore } from './syncedStore';
import type { CacheEntry, EventInit, QueuedChange, QueuedWrite, RemoteComment } from './types';

/**
 * Write side of a synced adapter: the remote primitives each tracker supplies,
 * and the queue that sends them in order (or holds them while the tracker is
 * unreachable). The public write methods are added by `SyncedAdapter`.
 */
export abstract class SyncedWriter extends SyncedStore {
  protected abstract remoteCreateMap(input: MapInput & { mode: MapMode }): Promise<MapDoc>;
  protected abstract remoteCreateTicket(
    map: MapDoc,
    input: { title: string; type: TicketType; body: string; hitl?: boolean },
  ): Promise<Ticket>;
  protected abstract remoteAddBlocking(map: MapDoc, blocker: Ticket, blocked: Ticket): Promise<void>;
  /** Drop the relation; a relation that is already gone is not an error. */
  protected abstract remoteRemoveBlocking(map: MapDoc, blocker: Ticket, blocked: Ticket): Promise<void>;
  /** Persist the title and body (with its `ticketMeta`) of an already-edited ticket. */
  protected abstract remoteEditTicket(map: MapDoc, t: Ticket): Promise<void>;
  protected abstract remoteReopen(map: MapDoc, t: Ticket): Promise<void>;
  /** Persist the claim and status (`ticketMeta`) of an already-updated ticket. */
  /** `confirm`: the trail lead set this ticket's settings (TicketMetaPatch.confirm); any other write never accepts them. */
  protected abstract remoteSetMeta(map: MapDoc, t: Ticket, o?: { confirm?: boolean }): Promise<void>;
  /** `c.writeId` must be readable back as the comment's `writeId`. */
  protected abstract remoteComment(map: MapDoc, t: Ticket, c: RemoteComment): Promise<void>;
  protected abstract remoteClose(map: MapDoc, t: Ticket, reason: 'completed' | 'not_planned'): Promise<void>;
  protected abstract remoteUpdateMap(map: MapDoc, o?: { confirm?: boolean }): Promise<void>;
  protected abstract remoteSetMode(map: MapDoc, mode: MapMode): Promise<void>;
  /** Post a decision record on its ticket, or on the trail when it has none. */
  protected abstract remotePostDecision(map: MapDoc, d: DecisionRecord, ticket?: Ticket): Promise<void>;
  protected abstract remoteUpdateDecision(map: MapDoc, d: DecisionRecord): Promise<void>;

  private writes = 0;

  /** Sends a queueable write, reading tickets and decisions from `e` (the trail before the write is applied). */
  private send(e: CacheEntry, w: QueuedWrite): Promise<unknown> {
    const c = w.change;
    const map = e.snap.map;
    switch (c.kind) {
      case 'mode':
        return this.remoteSetMode(map, c.mode);
      case 'sections':
        return this.remoteUpdateMap({ ...map, sections: c.sections });
      case 'mapMeta':
        return this.remoteUpdateMap(withMapMeta(map, c.patch), { confirm: !!c.patch.confirm });
      case 'blocking':
        return this.remoteAddBlocking(map, ticketOf(e, c.blockerId), ticketOf(e, c.blockedId));
      case 'unblocking':
        return this.remoteRemoveBlocking(map, ticketOf(e, c.blockerId), ticketOf(e, c.blockedId));
      case 'edit':
        return this.remoteEditTicket(map, withEdit(ticketOf(e, c.ticketId), c.edit));
      case 'reopen':
        return this.remoteReopen(map, reopened(ticketOf(e, c.ticketId)));
      case 'claim':
        return this.remoteSetMeta(map, { ...ticketOf(e, c.ticketId), assignee: c.assignee });
      case 'meta':
        return this.remoteSetMeta(map, withMeta(ticketOf(e, c.ticketId), c.patch), { confirm: !!c.patch.confirm });
      case 'comment':
        return this.remoteComment(map, ticketOf(e, c.ticketId), { author: c.author, body: c.body, writeId: w.id });
      case 'close':
        return this.remoteClose(map, ticketOf(e, c.ticketId), c.reason);
      case 'decision':
        return this.remotePostDecision(
          map,
          c.decision,
          c.decision.ticketId ? e.snap.tickets.find((t) => t.id === c.decision.ticketId) : undefined,
        );
      case 'supersede': {
        const d = e.decisions.find((x) => x.id === c.decisionId);
        if (!d) throw new OperationError(`decision ${c.decisionId} not found in ${w.mapId}`);
        return this.remoteUpdateDecision(map, { ...d, supersededBy: c.supersededBy });
      }
    }
  }

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
      } catch (err) {
        if (isTransient(err)) throw this.keepQueued(w, err);
        // the tracker rejected it for good (deleted issue, revoked access): drop it rather than block the queue
        this.queue.shift();
        this.health.set({ error: `Dropped queued write (${w.label}): ${(err as Error).message}` });
        continue;
      }
      this.queue.shift();
      this.health.online();
      this.health.set({});
    }
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
      const w: QueuedWrite = {
        id: writeId(mapId, c, this.now, ++this.writes),
        mapId,
        label,
        at: this.now(),
        change: c,
      };
      if (this.queue.length) this.enqueue(w);
      else {
        try {
          await this.send(e, w);
          this.health.online();
        } catch (err) {
          this.health.failed(err);
          if (!isTransient(err)) throw err;
          this.enqueue({ ...w, verify: err.code === 'offline' || undefined });
        }
      }
      applyWrite(e, w, this.now);
      e.at = this.now();
      e.snap.map.updatedAt = this.now();
      this.emit(event);
    });
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
