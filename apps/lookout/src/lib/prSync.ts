import { type PrSyncStatus, type TicketSync, type VerificationSyncEvent } from '@teamtrail/core';
import { apiBase } from './apiBase';
import { SessionEventSource } from './sessionEvents';

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

function set(next: PrSyncSnapshot) {
  snap = next;
  for (const l of listeners) l();
}

function load() {
  void fetch(`${apiBase()}/verification/sync`)
    .then((r) => (r.ok ? (r.json() as Promise<{ status: PrSyncStatus; tickets: TicketSync[] }>) : Promise.reject()))
    .then(
      (b) =>
        set({
          reached: true,
          live: true,
          status: b.status,
          tickets: Object.fromEntries(b.tickets.map((t) => [keyOf(t.mapId, t.ticketId), t])),
        }),
      () => snap.reached && set({ ...snap, live: false }),
    );
}

function start() {
  started = true;
  load();
  const es = new SessionEventSource();
  es.addEventListener('verification', (m) => {
    const e = JSON.parse((m as MessageEvent<string>).data) as VerificationSyncEvent | { kind?: string };
    if (e.kind === 'evidence') for (const l of evidenceListeners) l();
    if (e.kind !== 'sync') return;
    const tickets = { ...snap.tickets };
    for (const t of (e as VerificationSyncEvent).tickets) tickets[keyOf(t.mapId, t.ticketId)] = t;
    set({ reached: true, live: true, status: (e as VerificationSyncEvent).status, tickets });
  });
  es.addEventListener('error', () => snap.reached && snap.live && set({ ...snap, live: false }));
  es.addEventListener('open', () => snap.reached && load());
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
