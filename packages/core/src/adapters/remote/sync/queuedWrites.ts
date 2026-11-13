import type { Ticket } from '../../../model/types';
import { OperationError } from '../../../planning/operations/operationError';
import { withMapMeta } from '../../mapMeta';
import { reopened, withEdit, withoutBlocker } from '../../ticketEdits';
import { withMeta } from '../../ticketMeta';
import { withArchived } from '../../withArchived';
import type { CacheEntry, QueuedChange, QueuedWrite } from './types';

/** Changes that would duplicate if sent twice; the rest set state, so sending them again is harmless. */
export const CHECKED = new Set<QueuedChange['kind']>(['comment', 'decision', 'blocking', 'unblocking']);

export function ticketOf(e: CacheEntry, id: string) {
  const t = e.snap.tickets.find((x) => x.id === id);
  if (!t) throw new OperationError(`ticket ${id} not found in trail ${e.snap.map.key}`);
  return t;
}

function touch(t: Ticket, patch: Partial<Ticket>, now: () => number): Ticket {
  Object.assign(t, patch, { updatedAt: now() });
  return t;
}

/** Applies a queueable write to a cached (or freshly fetched) trail. Safe to repeat. */
export function applyWrite(e: CacheEntry, w: QueuedWrite, now: () => number) {
  const c = w.change;
  switch (c.kind) {
    case 'mode':
      e.snap.map.mode = c.mode;
      break;
    case 'archived':
      e.snap.map = withArchived(e.snap.map, c.archived);
      break;
    case 'sections':
      e.snap.map.sections = c.sections;
      break;
    case 'mapMeta':
      e.snap.map = withMapMeta(e.snap.map, c.patch);
      break;
    case 'blocking': {
      const t = ticketOf(e, c.blockedId);
      if (!t.blockedBy.includes(c.blockerId)) touch(t, { blockedBy: [...t.blockedBy, c.blockerId] }, now);
      break;
    }
    case 'unblocking': {
      const t = ticketOf(e, c.blockedId);
      if (t.blockedBy.includes(c.blockerId)) touch(t, withoutBlocker(t, c.blockerId), now);
      break;
    }
    case 'edit': {
      const t = ticketOf(e, c.ticketId);
      touch(t, withEdit(t, c.edit), now);
      break;
    }
    case 'reopen': {
      const t = ticketOf(e, c.ticketId);
      const open = reopened(t);
      delete t.closeReason;
      delete t.closedAt;
      touch(t, open, now);
      break;
    }
    case 'claim':
      touch(ticketOf(e, c.ticketId), { assignee: c.assignee }, now);
      break;
    case 'meta': {
      const t = ticketOf(e, c.ticketId);
      const next = withMeta(t, c.patch);
      if (!next.status) delete t.status;
      touch(t, next, now);
      break;
    }
    case 'comment': {
      const t = ticketOf(e, c.ticketId);
      if (!t.comments.some((x) => x.writeId === w.id))
        touch(
          t,
          {
            comments: [
              ...t.comments,
              { id: `local-${w.id}`, author: c.author, body: c.body.trim(), createdAt: w.at, writeId: w.id },
            ],
          },
          now,
        );
      break;
    }
    case 'close':
      touch(ticketOf(e, c.ticketId), { state: 'closed', closeReason: c.reason, closedAt: w.at }, now);
      break;
    case 'decision':
      if (!e.decisions.some((d) => d.id === c.decision.id)) e.decisions.push(c.decision);
      break;
    case 'supersede':
      e.decisions = e.decisions.map((d) => (d.id === c.decisionId ? { ...d, supersededBy: c.supersededBy } : d));
      break;
  }
}

/** Whether the tracker (`remote`, uncached) already has a write of a kind that must not be sent twice. */
export function hasLanded(remote: CacheEntry, w: QueuedWrite) {
  const c = w.change;
  const ticket = (id: string) => remote.snap.tickets.find((t) => t.id === id);
  if (c.kind === 'comment') return !!ticket(c.ticketId)?.comments.some((x) => x.writeId === w.id);
  if (c.kind === 'blocking') return !!ticket(c.blockedId)?.blockedBy.includes(c.blockerId);
  if (c.kind === 'unblocking') return !ticket(c.blockedId)?.blockedBy.includes(c.blockerId);
  if (c.kind === 'decision')
    return remote.decisions.some(
      (d) => d.id === c.decision.id && d.decidedAt === c.decision.decidedAt && d.answer === c.decision.answer,
    );
  return false;
}

/** Same inputs give the same id (recorded fixtures stay stable); the clock and a counter keep real writes apart. */
export function writeId(mapId: string, change: QueuedChange, now: () => number, n: number) {
  const s = `${mapId}\n${JSON.stringify(change)}\n${now()}\n${n}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return `${now().toString(36)}${(h >>> 0).toString(36)}`;
}
