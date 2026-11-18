import type { AnswerVia } from '../model/answerVia';
import { highRiskRefusal } from '../model/highRiskRefusal';
import { OperationError } from '../planning/operations/operationError';
import { ticketNeedsLookout } from '../policy/ticketNeedsLookout';

/**
 * Who may waive a diff rule for a ticket, or undo that waiver: the Lookout only, never Slack or an agent's chat; on a
 * high-risk ticket, the Lookout on this machine (`local`) and a caller allowed high-risk calls (`via: 'lookout'`).
 * `doing` names the action for the refusal ("Waiving a rule", "Undoing Go without R-1").
 */
export async function assertMayWaiveRule(
  root: string,
  r: { mapId: string; ticketId: string; key: string; via: AnswerVia; local: boolean; doing: string },
) {
  if (r.via === 'slack' || r.via === 'chat') throw new OperationError(`${r.doing} for ${r.key} is for the Lookout.`);
  if (!(await ticketNeedsLookout(root, r.mapId, r.ticketId))) return;
  if (r.via !== 'lookout') throw new OperationError(highRiskRefusal(r.key, r.via));
  if (!r.local) throw new OperationError(`${r.key} is high risk: change its rules in the Lookout on its machine.`);
}
