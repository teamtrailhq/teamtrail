import type { TrackerAdapter } from '../adapters/adapter';
import { Emitter } from '../lib/emitter';
import type { TrackerEvent } from '../model/types';

export interface TrackerHealth {
  /** `syncing` while a write is in flight. */
  status: 'idle' | 'syncing' | 'ok' | 'error';
  inflight: number;
  writes: number;
  errors: number;
  lastWriteMs?: number;
  lastWriteAt?: number;
  lastError?: string;
  /** Recent tracker events; `external` = picked up by the file watcher / webhook, not written by this app. */
  events: { at: number; external: boolean }[];
}

const WRITES = new Set<keyof TrackerAdapter>([
  'createMap',
  'setMapMode',
  'setMapArchived',
  'setMapMeta',
  'updateMapSections',
  'createTicket',
  'addBlocking',
  'removeBlocking',
  'editTicket',
  'reopen',
  'assign',
  'comment',
  'close',
  'setMeta',
  'createDecision',
  'markSuperseded',
]);
const EVENT_WINDOW = 5 * 60_000;

/**
 * `metrics.trackerHealth`: wraps an adapter to time every write (sync status,
 * last-write latency, errors) and record its event stream (pulse).
 */
export function monitorTracker(inner: TrackerAdapter) {
  let health: TrackerHealth = { status: 'idle', inflight: 0, writes: 0, errors: 0, events: [] };
  const changes = new Emitter<TrackerHealth>();
  const set = (patch: Partial<TrackerHealth>) => {
    health = { ...health, ...patch };
    changes.emit(health);
  };
  inner.subscribe((e: TrackerEvent) => {
    const cutoff = e.at - EVENT_WINDOW;
    set({
      events: [
        ...health.events.filter((x) => x.at >= cutoff),
        { at: e.at, external: e.kind === 'external.changed' || ('external' in e && !!e.external) },
      ],
    });
  });
  const adapter = new Proxy(inner, {
    get(target, prop, receiver) {
      const v = Reflect.get(target, prop, receiver);
      if (typeof v !== 'function') return v;
      if (!WRITES.has(prop as keyof TrackerAdapter)) return v.bind(target);
      return async (...args: unknown[]) => {
        const t0 = Date.now();
        set({ inflight: health.inflight + 1, status: 'syncing' });
        try {
          const out = await v.apply(target, args);
          const inflight = health.inflight - 1;
          set({
            inflight,
            writes: health.writes + 1,
            lastWriteMs: Date.now() - t0,
            lastWriteAt: Date.now(),
            status: inflight ? 'syncing' : 'ok',
            lastError: undefined,
          });
          return out;
        } catch (err) {
          const inflight = health.inflight - 1;
          set({
            inflight,
            errors: health.errors + 1,
            status: 'error',
            lastError: String((err as Error).message ?? err),
          });
          throw err;
        }
      };
    },
  });
  return {
    adapter,
    get health() {
      return health;
    },
    subscribe: (fn: (h: TrackerHealth) => void) => changes.on(fn),
  };
}

export type TrackerMonitor = ReturnType<typeof monitorTracker>;

/** `metrics.eventPulse`: tracker events per bucket over the last `windowMs`. */
export function eventPulse(h: TrackerHealth, now = Date.now(), windowMs = 60_000, buckets = 20) {
  const size = windowMs / buckets;
  const all = new Array<number>(buckets).fill(0);
  const external = new Array<number>(buckets).fill(0);
  for (const e of h.events) {
    const i = buckets - 1 - Math.floor((now - e.at) / size);
    if (i < 0 || i >= buckets) continue;
    all[i]++;
    if (e.external) external[i]++;
  }
  return { all, external, total: all.reduce((a, b) => a + b, 0) };
}
