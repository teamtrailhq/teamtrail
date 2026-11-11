import { type PrSyncStatus, type TicketSync, type VerificationSyncEvent } from '@teamtrail/core';
import { apiBase } from './apiBase';
import { newestWins } from './newestWins';
import { onServerEvent, onStreamDrop, onStreamOpen } from './trackerChanges';

export interface PrSyncSnapshot {
  /** The server answered at least once; false in a static build, where nothing is shown. */
  reached: boolean;
  /** The event stream is connected; while it is not, the status is unknown rather than its last value. */
  live: boolean;
  status?: PrSyncStatus;
  /** By `<mapId>/<ticketId>`. */
  tickets: Record<string, TicketSync>;
}

const keyOf = (mapId: string, ticketId: string) => `${mapId}/${ticketId}`;
let snap: PrSyncSnapshot = { reached: false, live: false, tickets: {} };
let started = false;
const listeners = new Set<() => void>();
const evidenceListeners = new Set<() => void>();
/** Loads land in the order they started. */
const order = newestWins();
/** `sync` events so far, and when each ticket and the status last came in one: a load started before has them older. */
let events = 0;
const sentAt = new Map<string, number>();
let statusAt = 0;

function set(next: PrSyncSnapshot) {
  snap = next;
  for (const l of listeners) l();
}

/** A load's tickets, keeping those an event brought after the load started. */
function merged(loaded: TicketSync[], since: number) {
  const tickets = Object.fromEntries(loaded.map((t) => [keyOf(t.mapId, t.ticketId), t]));
  for (const [key, at] of sentAt) if (at > since && snap.tickets[key]) tickets[key] = snap.tickets[key];
  return tickets;
}

function load() {
  const fresh = order.start();
  const since = events;
  void fetch(`${apiBase()}/verification/sync`)
    .then((r) => (r.ok ? (r.json() as Promise<{ status: PrSyncStatus; tickets: TicketSync[] }>) : Promise.reject()))
    .then(
      (b) =>
        fresh() &&
        set({
          reached: true,
          live: true,
          status: statusAt > since ? snap.status : b.status,
          tickets: merged(b.tickets, since),
        }),
      () => snap.reached && set({ ...snap, live: false }),
    );
}

function onVerification(raw: string) {
  const e = JSON.parse(raw) as VerificationSyncEvent | { kind?: string };
  if (e.kind === 'evidence') for (const l of evidenceListeners) l();
  if (e.kind !== 'sync') return;
  const sync = e as VerificationSyncEvent;
  statusAt = ++events;
  const tickets = { ...snap.tickets };
  for (const t of sync.tickets) {
    const key = keyOf(t.mapId, t.ticketId);
    tickets[key] = t;
    sentAt.set(key, events);
  }
  set({ reached: true, live: true, status: sync.status, tickets });
}

/** On the shared stream: loaded now and each time it opens, since nothing is sent while it is down. */
function start() {
  started = true;
  onServerEvent('verification', onVerification);
  onStreamDrop(() => snap.reached && snap.live && set({ ...snap, live: false }));
  onStreamOpen(load);
  load();
}

/** PR/CI evidence from the reconciler: one fetch plus the SSE `verification` event, shared by every reader. */
export const prSync = {
  subscribe(l: () => void) {
    if (!started) start();
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  get: () => snap,
  /** Attempts, verdicts, check logs or a run lock changed (`kind: 'evidence'` on the same stream). */
  onEvidence(l: () => void) {
    if (!started) start();
    evidenceListeners.add(l);
    return () => void evidenceListeners.delete(l);
  },
  ticket: (s: PrSyncSnapshot, mapId: string, ticketId: string): TicketSync | undefined =>
    s.tickets[keyOf(mapId, ticketId)],
};

/** The most serious open flag on a ticket, for the map node dot. */
export function worstFlag(s?: TicketSync): 'alert' | 'warn' | undefined {
  if (!s?.flags.length) return undefined;
  return s.flags.some((f) => f.severity === 'alert') ? 'alert' : 'warn';
}
