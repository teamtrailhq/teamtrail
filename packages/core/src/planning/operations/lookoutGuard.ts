import { approvesHighRisk, type AnswerVia } from '../../model/answerVia';
import { OperationError } from './operationError';

/**
 * How a decision that doesn't come from the Lookout shows it isn't high risk. `via` is how the human gave it;
 * `highRisk` is this machine's check of the ticket against its risk policy and evidence (policy/needsLookout.ts,
 * `ticketNeedsLookout`). A Slack answer reaches this machine through Teamtrail's Scout service, which could be made
 * to forge one, so on a high-risk ticket only the Lookout's word counts.
 */
export interface LookoutGuard {
  via?: AnswerVia;
  highRisk?: (mapId: string, ticketId: string) => boolean | Promise<boolean>;
}

/**
 * Refuses a decision on a ticket that only the Lookout may make. A record whose source is Slack counts as given
 * in Slack even when the caller says nothing, and a caller that can't say whether the ticket is high risk is
 * refused: it fails closed. Decisions about the trail as a whole (no ticket) are never high risk by a ticket, by
 * design: a high-risk question asked on the trail as a whole (no ticket held, such as framing) marks no ticket.
 * Such a question is still answered in the Lookout only (agents/agentDocs.ts refuses a Slack answer to it), and a
 * decision an agent records from it is high risk by its category at the decision gate.
 */
export async function assertLookoutGuard(
  g: LookoutGuard & { sourceKind?: string },
  t: { mapId: string; ticketId?: string; key?: string },
) {
  const via = g.via ?? (g.sourceKind === 'slack' ? 'slack' : undefined);
  if (!via || approvesHighRisk(via) || !t.ticketId) return;
  const which = t.key ?? t.ticketId;
  if (!g.highRisk) throw new OperationError(`Can't tell whether ${which} is high risk: decide it in the Lookout.`);
  if (await g.highRisk(t.mapId, t.ticketId))
    throw new OperationError(
      `${which} is high risk: decide it in the Lookout. Answers given in Slack don't count for it.`,
    );
}
