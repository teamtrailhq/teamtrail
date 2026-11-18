import type { MapSnapshot, Ticket } from '../model/types';
import { readAttempts } from '../verification/evidenceStore';
import { levelFor } from '../verification/levelFor';
import { criteriaRequired, type TicketCriteria } from './criteria';
import { readCriteria } from './criteriaStore';

/**
 * A ticket whose criteria wait for the trail lead's confirmation: `before-work`, before any agent may start it, or
 * `after-pass`, a pass graded against them that waits instead of closing (confirming checks it again by itself).
 */
export interface CriteriaWaiting {
  mapId: string;
  ticket: Pick<Ticket, 'id' | 'key' | 'title' | 'updatedAt'>;
  stage: 'before-work' | 'after-pass';
  /** How many criteria wait. */
  count: number;
  /** The pass that waits on them (`after-pass`). */
  attemptId?: string;
  since: number;
}

/** A pass graded against criteria nobody confirmed, on a ticket still waiting for verification. */
function waitingPass(root: string, mapId: string, t: Ticket) {
  if (t.state !== 'open' || t.status !== 'verifying') return undefined;
  const last = readAttempts(root, mapId, t.id).at(-1);
  return last?.result === 'pass' && last.criteria?.confirmed === false ? last : undefined;
}

function waiting(root: string, snap: MapSnapshot, t: Ticket, c?: TicketCriteria): CriteriaWaiting | undefined {
  if (!c?.criteria.length || c.confirmed) return undefined;
  const base = { mapId: snap.map.id, ticket: t, count: c.criteria.length };
  const pass = waitingPass(root, snap.map.id, t);
  if (pass) return { ...base, stage: 'after-pass', attemptId: pass.id, since: pass.finishedAt };
  if (t.state !== 'open' || t.assignee || t.status) return undefined;
  if (!criteriaRequired(true, t.type, levelFor(root, snap, t).info.level)) return undefined;
  return { ...base, stage: 'before-work', since: t.updatedAt };
}

/**
 * The trail's tickets whose acceptance criteria wait for the trail lead on this machine. Criteria are what done
 * means, so the human agrees to them before the work starts, not after: implementation tickets (verification on)
 * nobody claimed yet whose criteria an agent wrote wait for that, and no agent is offered them. A ticket with no
 * criteria yet goes on (its assignee writes them), as rework does (its agent already started); a pass against
 * criteria nobody confirmed then waits instead of closing (verification/outcome.ts).
 */
export function criteriaHeld(root: string, snap: MapSnapshot): CriteriaWaiting[] {
  const byTicket = new Map(readCriteria(root, snap.map.id).map((c) => [c.ticketId, c]));
  return snap.tickets.flatMap((t) => waiting(root, snap, t, byTicket.get(t.id)) ?? []);
}
