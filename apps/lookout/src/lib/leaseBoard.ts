import { Emitter, returnedLine, type ActivityStream, type TicketLease } from '@teamtrail/core';
import { apiBase } from './apiBase';

/** Returns in the last quarter hour are logged when the Lookout opens, older ones are history. */
const BACKLOG_MS = 15 * 60_000;

/**
 * Claim leases of connected agents (core ticketLease.ts), mirrored from the
 * local server. A lease that turns into a tombstone is logged once: the ticket
 * went back to the queue.
 */
export class LeaseBoard {
  leases: TicketLease[] = [];
  private changes = new Emitter<TicketLease[]>();
  private logged = new Set<string>();
  private since = Date.now() - BACKLOG_MS;

  constructor(private activity: ActivityStream) {}

  subscribe(fn: (l: TicketLease[]) => void) {
    return this.changes.on(fn);
  }

  set(leases: TicketLease[]) {
    this.leases = leases;
    for (const l of leases) {
      const id = `${l.mapId}/${l.ticketId}/${l.returned?.at}`;
      if (!l.returned || l.returned.at < this.since || this.logged.has(id)) continue;
      this.logged.add(id);
      this.activity.push({ source: 'system', level: 'warn', ticketId: l.ticketId, text: returnedLine(l) });
    }
    this.changes.emit(leases);
  }

  /** Back to the queue now, with the handoff comment (the server does the tracker writes). */
  async release(mapId: string, ticketId: string, by: string) {
    const r = await fetch(`${apiBase()}/agents/leases/release`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mapId, ticketId, by }),
    });
    if (!r.ok) throw new Error(((await r.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${r.status}`);
  }
}
