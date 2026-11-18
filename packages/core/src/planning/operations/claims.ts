import type { TrackerAdapter } from '../../adapters/adapter';
import { sleep } from '../../lib/emitter';
import type { ActorKind } from '../../model/lifecycle';
import type { MapSnapshot, TicketType } from '../../model/types';
import { frontier, deriveStates } from '../derive';
import { transition, type TransitionOptions } from '../lifecycle/transition';
import { assertNotArchived } from './assertNotArchived';
import { OperationError } from './operationError';

/** Who is acting, for the journal. Agents are the default actor kind. */
export interface ActorOptions extends TransitionOptions {
  actorKind?: ActorKind;
  reason?: string;
  sessionId?: string;
}

/**
 * The tickets to work next, best first: rework first (a failed attempt waits on a fix),
 * then reviews (finished work waits on them), then the frontier, oldest first.
 */
export function orderNext(snap: MapSnapshot, opts: { types?: TicketType[]; exclude?: string[] } = {}) {
  if (snap.map.archived) return [];
  const states = deriveStates(snap.tickets, snap.map.mode);
  const rework = snap.tickets.filter((t) => states.get(t.id) === 'rework').sort((a, b) => a.createdAt - b.createdAt);
  const ready = frontier(snap.tickets, snap.map.mode);
  return [...rework, ...ready.filter((t) => t.type === 'review'), ...ready.filter((t) => t.type !== 'review')].filter(
    (t) => (!opts.types || opts.types.includes(t.type)) && !opts.exclude?.includes(t.id),
  );
}

/** The ticket to work next: the first of `orderNext`. */
export function chooseNext(snap: MapSnapshot, opts: { types?: TicketType[]; exclude?: string[] } = {}) {
  return orderNext(snap, opts)[0];
}

/**
 * How long a claim waits before reading who holds the ticket, in a tracker other machines write to: a rival claim
 * read the issue before this one landed and is still on its way. The last write wins in the tracker, so after
 * this each claimer reads the same answer.
 */
export const CLAIM_SETTLE_MS = 1500;

/** The ticket as the tracker has it after a claim: read from GitHub or Linear themselves, past any cache. */
async function claimedNow(o: { adapter: TrackerAdapter; mapId: string; ticketId: string; settleMs?: number }) {
  const remote = o.adapter.kind === 'github' || o.adapter.kind === 'linear';
  if (remote) await sleep(o.settleMs ?? CLAIM_SETTLE_MS);
  const after = await o.adapter.loadMap(o.mapId, remote ? { fresh: true } : undefined);
  return after.tickets.find((x) => x.id === o.ticketId);
}

/**
 * Claim = assignment. Re-reads after assigning to detect a parallel session winning the race; with GitHub or
 * Linear, from the tracker itself after a moment, since another machine's claim never shows in this one's cache.
 */
export async function claim(
  adapter: TrackerAdapter,
  mapId: string,
  ticketId: string,
  by: ActorOptions & { assignee: string; settleMs?: number },
) {
  const { assignee } = by;
  const before = await adapter.loadMap(mapId);
  const t = before.tickets.find((x) => x.id === ticketId);
  if (!t) throw new OperationError(`ticket ${ticketId} not found`);
  assertNotArchived(before.map);
  const state = deriveStates(before.tickets, before.map.mode).get(ticketId);
  if (state !== 'frontier' && state !== 'rework') throw new OperationError(`${t.key} is ${state}, not on the frontier`);
  await transition(adapter, mapId, ticketId, {
    event: 'claim',
    actor: assignee,
    actorKind: by.actorKind ?? 'agent',
    reason: by.reason,
    sessionId: by.sessionId,
    journal: by.journal,
  });
  const now = await claimedNow({ adapter, mapId, ticketId, settleMs: by.settleMs });
  if (now?.assignee !== assignee) throw new OperationError(`${t.key} was claimed by ${now?.assignee ?? 'nobody'}`);
  return now;
}

/** Back to the queue (ready, or rework when an attempt failed). `actor` defaults to the assignee. */
export async function release(
  adapter: TrackerAdapter,
  mapId: string,
  ticketId: string,
  opts: ActorOptions & { actor?: string } = {},
) {
  const snap = await adapter.loadMap(mapId);
  const t = snap.tickets.find((x) => x.id === ticketId);
  if (!t) throw new OperationError(`ticket ${ticketId} not found`);
  await transition(adapter, mapId, ticketId, {
    event: 'release',
    actor: opts.actor ?? t.assignee ?? 'trail lead',
    actorKind: opts.actorKind ?? 'agent',
    reason: opts.reason,
    sessionId: opts.sessionId,
    journal: opts.journal,
  });
}
