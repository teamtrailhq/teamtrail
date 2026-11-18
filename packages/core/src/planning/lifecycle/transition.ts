import type { TrackerAdapter } from '../../adapters/adapter';
import { KeyedLock } from '../../lib/keyedLock';
import type { ActorKind, Journal, LifecycleEvent, TicketPhase } from '../../model/lifecycle';
import type { Ticket } from '../../model/types';
import { OperationError } from '../operations/operationError';
import { ticketPhase } from './phase';
import { ruleFor, type TransitionRule } from './transitions';

export interface TransitionRequest extends TransitionOptions {
  event: LifecycleEvent;
  actor: string;
  actorKind: ActorKind;
  /** Target, when the event allows several (release and expire pick ready or rework themselves). */
  to?: TicketPhase;
  /** Refuse unless the ticket is still in this phase (compare-and-set). */
  expect?: TicketPhase;
  reason?: string;
  sessionId?: string;
}

export interface TransitionOptions {
  /** Where the transition is recorded; without one it is only written to the tracker. */
  journal?: Journal;
}

/** Serializes transitions of one ticket inside this process; other processes are caught by `expect` and re-checks. */
const locks = new KeyedLock();

function target(rule: TransitionRule, t: Ticket, want?: TicketPhase): TicketPhase {
  if (want) {
    if (!rule.to.includes(want)) throw new OperationError(`${rule.event} cannot lead to ${want}`);
    return want;
  }
  if (rule.to.length === 1) return rule.to[0];
  if (rule.event === 'release' || rule.event === 'expire') return t.status === 'rework' ? 'rework' : 'ready';
  throw new OperationError(`${rule.event} needs a target: ${rule.to.join(' or ')}`);
}

/** The tracker writes that put `t` into phase `to`. Each write is skipped when it would change nothing. */
async function apply(adapter: TrackerAdapter, mapId: string, t: Ticket, step: { to: TicketPhase; actor: string }) {
  const { to, actor } = step;
  const status = async (s: Ticket['status'] | null) => {
    if ((t.status ?? null) !== s) await adapter.setMeta(mapId, t.id, { status: s });
  };
  switch (to) {
    case 'working':
      if (t.assignee !== actor) await adapter.assign(mapId, t.id, actor);
      return;
    case 'ready':
    case 'rework':
      if (t.state === 'closed') await adapter.reopen(mapId, t.id);
      await status(to === 'rework' ? 'rework' : null);
      if (t.assignee) await adapter.assign(mapId, t.id, null);
      return;
    case 'verifying':
    case 'blocked':
      if (t.state === 'closed') await adapter.reopen(mapId, t.id);
      await status(to);
      return;
    case 'done':
    case 'cancelled':
      await status(null);
      await adapter.close(mapId, t.id, to === 'done' ? 'completed' : 'not_planned');
      return;
    case 'backlog':
      throw new OperationError('backlog follows from blockers; no transition leads there');
  }
}

/**
 * The only way a ticket's lifecycle state changes: checks the event against
 * the transition table and the actor, writes the tracker, then records who,
 * why and when in the journal.
 */
export function transition(adapter: TrackerAdapter, mapId: string, ticketId: string, req: TransitionRequest) {
  return locks.run(`${mapId}/${ticketId}`, async () => {
    const snap = await adapter.loadMap(mapId);
    const t = snap.tickets.find((x) => x.id === ticketId);
    if (!t) throw new OperationError(`ticket ${ticketId} not found`);
    const from = ticketPhase(t, new Map(snap.tickets.map((x) => [x.id, x])), snap.map.mode);
    if (req.expect && from !== req.expect) throw new OperationError(`${t.key} changed: it is ${from} now`);
    const rule = ruleFor(req.event);
    if (!rule.from.includes(from))
      throw new OperationError(`${t.key} is ${from}; ${req.event} needs ${rule.from.join(' or ')}`);
    if (!rule.actors.includes(req.actorKind)) throw new OperationError(`${req.event} is not for ${req.actorKind}s`);
    const to = target(rule, t, req.to);
    await apply(adapter, mapId, t, { to, actor: req.actor });
    try {
      await req.journal?.append({
        v: 1,
        kind: 'transition',
        at: Date.now(),
        mapId,
        ticketId,
        ticketKey: t.key,
        event: req.event,
        from,
        to,
        actor: req.actor,
        actorKind: req.actorKind,
        ...(req.reason ? { reason: req.reason } : {}),
        ...(req.sessionId ? { sessionId: req.sessionId } : {}),
      });
    } catch {
      // history only: the tracker already holds the new state
    }
    return { ticket: t, from, to };
  });
}
