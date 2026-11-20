import { Emitter } from '../../../lib/emitter';
import { KeyedLock } from '../../../lib/keyedLock';
import type { DecisionRecord, MapSnapshot, MapSummary, TrackerEvent } from '../../../model/types';
import { isTransient, TrackerError, type RateInfo } from '../http';
import { fingerprint } from './fingerprint';
import { patchListed } from './listedTrails';
import { Poller } from './poller';
import { applyWrite } from './queuedWrites';
import { SyncHealth } from './syncHealth';
import type { CacheEntry, EventInit, RefusedSink, SyncOptions, SyncStatus, WriteAuthor } from './types';
import { WriteQueue } from './writeQueue';

export const isNotFound = (e: unknown) => e instanceof TrackerError && e.code === 'not_found';

/**
 * Read side of a synced adapter: the trail cache and the poll loop that sends queued writes and picks up changes
 * made in the tracker (`sync`, in SyncedRefresh). Writes are added by `SyncedWriter`, which also supplies `flush`.
 */
export abstract class SyncedStore {
  protected abstract fetchMaps(): Promise<MapSummary[]>;
  protected abstract fetchMap(mapId: string): Promise<{ snap: MapSnapshot; decisions: DecisionRecord[] }>;
  protected abstract rate(): RateInfo | undefined;
  /** Sends the queued writes, oldest first. */
  protected abstract flush(): Promise<void>;
  /** Picks up the changes made in the tracker. */
  protected abstract sync(): Promise<void>;

  protected readonly now: () => number;
  protected readonly pollMs: number;
  protected readonly queue: WriteQueue;
  protected readonly health: SyncHealth;
  protected readonly poller: Poller;
  protected readonly author?: () => WriteAuthor | undefined;
  protected readonly refused?: RefusedSink;
  protected readonly locks = new KeyedLock();
  protected maps?: { list: MapSummary[]; at: number };
  protected entries = new Map<string, CacheEntry>();
  /** Trails known to have changed in the tracker and not read again yet; kept until a read succeeds. */
  protected pending = new Set<string>();
  private events = new Emitter<TrackerEvent>();
  private loading = new Map<string, Promise<CacheEntry>>();
  /** Local writes per trail: a read that started before one must not replace the cache it updated. */
  private generations = new Map<string, number>();
  private subscribers = 0;
  private closed = false;
  private ttlMs: number;

  constructor(opts: SyncOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.pollMs = opts.pollMs ?? 10_000;
    this.ttlMs = opts.ttlMs ?? 15_000;
    this.author = opts.author;
    this.refused = opts.refused;
    this.queue = new WriteQueue(opts.outbox, (error) => this.health.note(error));
    this.health = new SyncHealth({
      now: this.now,
      queued: () => this.queue.length,
      rate: () => this.rate(),
      kept: this.refused?.kept && (() => this.refused!.kept!()),
    });
    this.poller = new Poller({
      pollMs: this.pollMs,
      maxBackoffMs: opts.maxBackoffMs ?? 120_000,
      manual: !!opts.manual,
      now: this.now,
      idle: () => this.closed || (!this.polling() && !this.queue.length),
      run: () => this.poll(),
      failed: (err) => this.health.failed(err),
    });
    this.poller.schedule(0);
  }

  get status(): SyncStatus {
    return this.health.status;
  }

  onStatus(fn: (s: SyncStatus) => void) {
    return this.health.onStatus(fn);
  }

  protected emit(e: EventInit) {
    this.events.emit({ ...e, at: this.now() } as TrackerEvent);
  }

  protected polling() {
    return this.subscribers > 0 && !this.closed;
  }

  private fresh(at: number) {
    return this.polling() || this.now() - at < this.ttlMs;
  }

  /** Marks a local write to `mapId`; reads already on their way for it are then not taken. */
  protected touch(mapId: string) {
    this.generations.set(mapId, this.generation(mapId) + 1);
  }

  protected generation(mapId: string) {
    return this.generations.get(mapId) ?? 0;
  }

  async listMaps(): Promise<MapSummary[]> {
    if (this.maps && this.fresh(this.maps.at)) return structuredClone(this.maps.list);
    try {
      const list = await this.fetchMaps();
      this.health.online();
      this.maps = { list, at: this.now() };
    } catch (err) {
      this.health.failed(err);
      if (!(this.maps && isTransient(err))) throw err;
    }
    return structuredClone(this.maps.list);
  }

  protected async fetchEntry(mapId: string): Promise<CacheEntry> {
    const inflight = this.loading.get(mapId);
    if (inflight) return inflight;
    const p = this.fetchMap(mapId)
      .then((r) => {
        this.health.online();
        return { ...r, at: this.now() };
      })
      .finally(() => this.loading.delete(mapId));
    this.loading.set(mapId, p);
    return p;
  }

  /** Remote state plus the queued writes not sent yet (after a restart there is no cache that has them). */
  protected withQueued(mapId: string, remote: CacheEntry): CacheEntry {
    const queued = this.queue.forMap(mapId);
    if (!queued.length) return remote;
    const e = structuredClone(remote);
    for (const w of queued) {
      try {
        applyWrite(e, w, this.now);
      } catch {
        // its ticket is gone; flush() drops the write
      }
    }
    return e;
  }

  /**
   * The trail as just read from the tracker replaces the cached one, whatever changed (a fingerprint only decides
   * whether to tell listeners), and its title and archived label update the trail list.
   */
  protected replace(mapId: string, remote: CacheEntry) {
    const before = this.entries.get(mapId);
    const next = this.withQueued(mapId, remote);
    this.entries.set(mapId, next);
    this.pending.delete(mapId);
    if (patchListed(this.maps?.list, next.snap.map)) this.emit({ kind: 'external.changed' });
    if (!before || fingerprint(before) === fingerprint(next)) return;
    const seen = new Set(before.decisions.map((d) => d.id));
    for (const d of next.decisions.filter((x) => !seen.has(x.id)))
      this.emit({ kind: 'decision.recorded', mapId, decisionId: d.id, ticketId: d.ticketId, external: true });
    this.emit({ kind: 'external.changed', mapId });
  }

  /** The trail is gone from the tracker (deleted, moved, no longer labelled a trail): it leaves the cache and list. */
  protected forget(mapId: string) {
    const known = this.entries.delete(mapId) || !!this.maps?.list.some((m) => m.id === mapId);
    this.pending.delete(mapId);
    if (this.maps) this.maps.list = this.maps.list.filter((m) => m.id !== mapId);
    if (known) this.emit({ kind: 'external.changed', mapId });
  }

  /** Reads one trail from the tracker into the cache, unless a local write landed meanwhile. */
  protected async reread(mapId: string) {
    const gen = this.generation(mapId);
    let remote: CacheEntry;
    try {
      remote = { ...(await this.fetchMap(mapId)), at: this.now() };
    } catch (err) {
      if (isNotFound(err)) this.forget(mapId);
      throw err;
    }
    this.health.online();
    if (gen === this.generation(mapId)) this.replace(mapId, remote);
  }

  /** Cached trail; refetched when stale, served stale while the tracker is unreachable. */
  protected async entry(mapId: string): Promise<CacheEntry> {
    const cached = this.entries.get(mapId);
    if (cached && (this.fresh(cached.at) || this.queue.length)) return cached;
    const gen = this.generation(mapId);
    try {
      const remote = await this.fetchEntry(mapId);
      if (gen === this.generation(mapId) || !this.entries.has(mapId)) this.replace(mapId, remote);
      return this.entries.get(mapId)!;
    } catch (err) {
      this.health.failed(err);
      if (isNotFound(err)) this.forget(mapId);
      if (cached && isTransient(err)) return cached;
      throw err;
    }
  }

  /** `fresh`: read the tracker itself, not the cache (a claim checking who won); the cache while writes wait. */
  async loadMap(mapId: string, o: { fresh?: boolean } = {}): Promise<MapSnapshot> {
    if (o.fresh && !this.queue.length)
      await this.reread(mapId).catch((err) => {
        this.health.failed(err);
        if (!isTransient(err)) throw err;
      });
    return structuredClone((await this.entry(mapId)).snap);
  }

  async listDecisions(mapId: string): Promise<DecisionRecord[]> {
    return structuredClone((await this.entry(mapId)).decisions);
  }

  subscribe(listener: (e: TrackerEvent) => void) {
    const off = this.events.on(listener);
    if (++this.subscribers === 1) this.poller.schedule(0);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      off();
      if (--this.subscribers === 0 && !this.queue.length) this.poller.stop();
    };
  }

  /** One poll: send queued writes, then pick up tracker-side changes. Exposed for tests. */
  tick() {
    return this.poller.tick();
  }

  private async poll() {
    await this.flush();
    if (this.polling()) await this.sync();
  }

  /** Stops polling. Unsent queued writes stay in the outbox store for the next run (lost without one). */
  dispose() {
    this.closed = true;
    this.poller.stop();
    this.queue.release();
  }
}
