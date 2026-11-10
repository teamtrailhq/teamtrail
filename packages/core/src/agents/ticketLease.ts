import { AGENTS_DIR } from './agentLink';

/**
 * An agent's claim on a ticket is a lease: the assignment lives in the tracker,
 * the lease next to the session docs. Every tool call of the claiming agent
 * renews it; once it expires, the ticket goes back to the queue with a handoff
 * comment that keeps the agent's progress notes and decisions.
 *
 *   <tracker>/.agents/leases/<mapId>--<ticketId>.json   TicketLease
 */
export const DEFAULT_LEASE_MINUTES = 15;
export const DEFAULT_LEASE_MS = DEFAULT_LEASE_MINUTES * 60_000;
/** Environment variable that sets the lease length in minutes (`teamtrail mcp --lease-minutes` wins). */
export const LEASE_MINUTES_ENV = 'TEAMTRAIL_LEASE_MINUTES';
/** A lease with less than this share of its length left shows as stalled. */
export const STALL_FRACTION = 1 / 3;
/** Returned leases stay as tombstones this long, so every Lookout can log the return. */
export const TOMBSTONE_MS = 3_600_000;

const safe = (s: string) => s.replace(/[^\w.-]/g, '_');

/** `15 min`, or `3 s` for leases shorter than a minute. */
export const leaseSpan = (ms: number) =>
  ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.round(ms / 60_000)} min`;

export const leasePaths = {
  dir: `${AGENTS_DIR}/leases`,
  lease: (mapId: string, ticketId: string) => `${AGENTS_DIR}/leases/${safe(mapId)}--${safe(ticketId)}.json`,
};

export type LeaseReturnReason = 'expired' | 'trail lead';

export interface TicketLease {
  v: 1;
  mapId: string;
  ticketId: string;
  ticketKey: string;
  /** Trail name of the agent holding the claim (the ticket's assignee). */
  agent: string;
  sessionId?: string;
  /**
   * Who is behind the claim, beyond the trail name: `token:<id>` for a remote agent, `local:<id>` for one
   * connection on this machine. Two connections under one trail name are told apart by it.
   */
  origin?: string;
  pid: number;
  claimedAt: number;
  renewedAt: number;
  ttlMs: number;
  expiresAt: number;
  /** The agent's progress notes on this ticket, oldest first. */
  notes: string[];
  /** Decisions recorded while holding the claim, as `D-3 · summary`. */
  decisions: string[];
  /** Path globs the agent said it will change (claim_ticket `touches`). */
  touches?: string[];
  /** The worktree prepared for this claim, when there is one. */
  workspace?: { path: string; branch: string; base: string };
  /** Set once the ticket went back to the queue; the file is then a tombstone. */
  returned?: { at: number; reason: LeaseReturnReason; by: string };
}

export type LeaseHealth = 'live' | 'stalled' | 'expired';

export function leaseHealth(l: Pick<TicketLease, 'expiresAt' | 'ttlMs'>, now = Date.now()): LeaseHealth {
  const left = l.expiresAt - now;
  if (left <= 0) return 'expired';
  return left <= l.ttlMs * STALL_FRACTION ? 'stalled' : 'live';
}

/** Lease length from `--lease-minutes`, else the environment, else the default. */
export function leaseMs(minutes?: number | string) {
  const n = Number(minutes);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 60_000) : DEFAULT_LEASE_MS;
}

export const HANDOFF_PREFIX = '**Returned to queue**';

/** The comment left on a ticket when its claim is returned: what the previous agent did, so the next one resumes. */
export function handoffComment(l: TicketLease, reason: LeaseReturnReason, by: string) {
  const silent = leaseSpan(Date.now() - l.renewedAt);
  const why =
    reason === 'expired'
      ? `${l.agent} went silent (no activity for ${silent}, lease ${leaseSpan(l.ttlMs)}).`
      : `released by ${by}; ${l.agent} last active ${silent} ago.`;
  const parts = [`${HANDOFF_PREFIX} · ${why} Resume from these notes.`];
  if (l.notes.length) parts.push(`Progress notes from ${l.agent}:\n${l.notes.map((n) => `- ${n}`).join('\n')}`);
  if (l.decisions.length) parts.push(`Decisions recorded:\n${l.decisions.map((d) => `- ${d}`).join('\n')}`);
  if (!l.notes.length && !l.decisions.length) parts.push(`${l.agent} left no progress notes.`);
  return parts.join('\n\n');
}

export const isHandoff = (body: string) => body.startsWith(HANDOFF_PREFIX);

/** Activity log line for a returned lease. */
export function returnedLine(l: TicketLease) {
  return l.returned?.reason === 'trail lead'
    ? `${l.ticketKey} returned to queue · claim of ${l.agent} released by ${l.returned.by}`
    : `${l.ticketKey} returned to queue after ${l.agent} went silent`;
}
