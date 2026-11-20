import { Emitter } from '../../../lib/emitter';
import { TrackerError, type RateInfo } from '../http';
import type { SyncStatus } from './types';

export interface SyncHealthOptions {
  now: () => number;
  queued: () => number;
  rate: () => RateInfo | undefined;
  /** The refused writes still waiting for the human (RefusedSink.kept); the others leave the status. */
  kept?: () => ReadonlySet<string>;
}

/** Refused writes kept in the status. */
const MAX_DROPPED = 5;

/** The adapter's `SyncStatus`, moved by request outcomes and published to `onStatus` listeners. */
export class SyncHealth {
  private current: SyncStatus;
  private events = new Emitter<SyncStatus>();

  constructor(private readonly o: SyncHealthOptions) {
    this.current = { state: 'connecting', queued: o.queued() };
  }

  get status(): SyncStatus {
    return this.shown(this.current);
  }

  onStatus(fn: (s: SyncStatus) => void) {
    return this.events.on((s) => fn(this.shown(s)));
  }

  /**
   * The status without the refused writes the human has retried or discarded since (in this process or any other):
   * the store is what says a write still waits, so the Settings line follows Retry and Discard.
   */
  private shown(s: SyncStatus): SyncStatus {
    if (!s.dropped?.some((d) => d.id) || !this.o.kept) return s;
    let kept: ReadonlySet<string>;
    try {
      kept = this.o.kept();
    } catch {
      return s;
    }
    const dropped = s.dropped.filter((d) => !d.id || kept.has(d.id));
    if (dropped.length === s.dropped.length) return s;
    return { ...s, dropped };
  }

  set(patch: Partial<SyncStatus>) {
    this.current = { ...this.current, ...patch, queued: this.o.queued(), rate: this.o.rate() ?? this.current.rate };
    this.events.emit(this.current);
  }

  online() {
    if (this.current.state !== 'online' || this.current.error)
      this.set({ state: 'online', error: undefined, resetAt: undefined, lastSyncAt: this.o.now() });
    else this.current = { ...this.current, lastSyncAt: this.o.now(), rate: this.o.rate() ?? this.current.rate };
  }

  failed(err: unknown) {
    const e = err as TrackerError;
    if (e instanceof TrackerError && e.code === 'offline') this.set({ state: 'offline', error: e.message });
    else if (e instanceof TrackerError && e.code === 'rate_limited')
      this.set({ state: 'rate-limited', resetAt: e.resetAt, error: e.message });
    else if (e instanceof TrackerError && e.code === 'auth') this.set({ state: 'auth-error', error: e.message });
    else this.set({ error: String((err as Error)?.message ?? err) });
  }

  /** A queued write the tracker refused for good: kept in the status (online() doesn't clear it) and shown; `id` when it
   * was kept for the human, so it leaves once they retry or discard it. */
  dropped(o: { id?: string; label: string; error: string }) {
    const { label, error } = o;
    const entry = { ...(o.id ? { id: o.id } : {}), label, error, at: this.o.now() };
    const dropped = [...(this.current.dropped ?? []), entry].slice(-MAX_DROPPED);
    this.set({ dropped, error: `Dropped queued write (${label}): ${error}` });
  }

  /** Records an error without notifying listeners; the next status change carries it. */
  note(error: string) {
    this.current = { ...this.current, error };
  }
}
