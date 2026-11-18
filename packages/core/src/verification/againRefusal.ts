import { readCriteria } from '../criteria/criteriaStore';
import { staleness } from '../evidence/stale';
import type { TicketPhase } from '../model/lifecycle';
import type { Ticket } from '../model/types';
import type { VerificationAttempt } from '../model/verification';
import { checksApproval, checksWaitReason } from './checksApproval';

const NEW_COMPLETION = 'only a new completion can prove it: send it to rework';

/**
 * Why a ticket's last completion can't be checked again (verifyAgain.ts), or undefined when it can: it passed
 * everything but criteria nobody had confirmed, they are confirmed now, the approved checks may run, and the code is
 * still exactly the commit (and working tree) it ran on. Anything else needs a new completion, never a regrade.
 */
export async function againRefusal(o: {
  root: string;
  mapId: string;
  t: Ticket;
  phase: TicketPhase;
  last?: VerificationAttempt;
}): Promise<string | undefined> {
  const { root, mapId, t, last } = o;
  if (o.phase !== 'done' && o.phase !== 'verifying')
    return `${t.key} is ${o.phase}; only a done or verifying ticket is checked again`;
  if (!last) return `${t.key} has no completion to check again`;
  if (last.remote) return `${last.id} came from another machine: ${NEW_COMPLETION}`;
  if (last.result !== 'pass') return `${last.id} didn't pass: ${NEW_COMPLETION}`;
  if (last.criteria?.confirmed !== false) return `${last.id} was already checked against confirmed criteria`;
  if (!readCriteria(root, mapId).find((c) => c.ticketId === t.id)?.confirmed)
    return `Confirm ${t.key}'s criteria first: it is checked again against them`;
  const approval = checksApproval(root);
  if (approval.waiting) return checksWaitReason(approval);
  const now = await staleness(root, last.git);
  if (!now.checked) return `The checkout ${last.id} ran in is gone here: ${NEW_COMPLETION}`;
  if (now.stale) return `The code moved on since ${last.id} (${now.reason}): ${NEW_COMPLETION}`;
  return undefined;
}
