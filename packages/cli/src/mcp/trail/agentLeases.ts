import type { Ticket, TicketLease, TrackerAdapter } from '@teamtrail/core';
import { dropLease, reclaimExpired, renewLease, writeLease } from '@teamtrail/core/agents';

interface Held {
  mapId: string;
  ticketId: string;
  key: string;
}

/**
 * The leases on the tickets this agent claimed. Every tool call renews them
 * (the heartbeat); a lease that is gone means the ticket went back to the queue.
 */
export class AgentLeases {
  private held = new Map<string, Held>();
  /** Keys of tickets whose lease was lost since the last call, reported once. */
  private lost: string[] = [];

  constructor(
    private root: string,
    readonly ttlMs: number,
    /** Who is behind the agent (AgentContext.origin), kept on every lease it holds. */
    private origin?: string,
  ) {}

  private id = (mapId: string, ticketId: string) => `${mapId}/${ticketId}`;

  hold(agent: string, mapId: string, t: Ticket, opts: { sessionId?: string; now?: number } = {}) {
    const { sessionId, now = Date.now() } = opts;
    const lease: TicketLease = {
      v: 1,
      mapId,
      ticketId: t.id,
      ticketKey: t.key,
      agent,
      sessionId,
      ...(this.origin ? { origin: this.origin } : {}),
      pid: process.pid,
      claimedAt: now,
      renewedAt: now,
      ttlMs: this.ttlMs,
      expiresAt: now + this.ttlMs,
      notes: [],
      decisions: [],
    };
    writeLease(this.root, lease);
    this.held.set(this.id(mapId, t.id), { mapId, ticketId: t.id, key: t.key });
    return lease;
  }

  /** Renew every held lease; `note`/`decision` are added to the lease of `ticketId`. Returns the ones lost. */
  renew(agent: string, extra: { ticketId?: string; note?: string; decision?: string; sessionId?: string } = {}) {
    const lost: Held[] = [];
    for (const [k, h] of this.held) {
      const mine = h.ticketId === extra.ticketId;
      if (renewLease(this.root, { mapId: h.mapId, ticketId: h.ticketId, agent }, mine ? extra : {})) continue;
      this.held.delete(k);
      this.lost.push(h.key);
      lost.push(h);
    }
    return lost;
  }

  /** Tickets whose lease ran out (or the trail lead released) since the last call. */
  takeLost() {
    return this.lost.splice(0);
  }

  drop(mapId: string, ticketId: string) {
    this.held.delete(this.id(mapId, ticketId));
    dropLease(this.root, mapId, ticketId);
  }

  /** Return the expired leases of other (crashed) agents before picking work. */
  reclaim(adapter: TrackerAdapter) {
    return reclaimExpired(this.root, adapter);
  }
}
