import type { AnswerVia } from '../model/answerVia';
import { highRiskRefusal } from '../model/highRiskRefusal';
import { OperationError } from '../planning/operations/operationError';
import { needsLookout } from '../policy/needsLookout';
import { ticketNeedsLookout } from '../policy/ticketNeedsLookout';

/**
 * Who may accept a ticket without its failing checks: the trail lead in the Lookout, never Slack or an agent's chat.
 * On a high-risk ticket (the risk policy's paths in the work, or a high-risk question asked on it) only the Lookout
 * on this machine, and not a caller an embedding server's sign-in denies high-risk calls (`lookout-limited`).
 */
export async function assertMayWaive(
  root: string,
  o: { mapId: string; ticketId: string; key: string; attemptId: string; via: AnswerVia; local: boolean },
) {
  if (o.via === 'slack' || o.via === 'chat')
    throw new OperationError(`Accepting ${o.key} without a check is for the Lookout only.`);
  const high =
    needsLookout.approval(root, { mapId: o.mapId, ticketId: o.ticketId, attemptId: o.attemptId }) ||
    (await ticketNeedsLookout(root, o.mapId, o.ticketId));
  if (!high) return;
  if (o.via !== 'lookout') throw new OperationError(highRiskRefusal(o.key, o.via));
  if (!o.local)
    throw new OperationError(`${o.key} is high risk: accept it without a check in the Lookout on its machine.`);
}
