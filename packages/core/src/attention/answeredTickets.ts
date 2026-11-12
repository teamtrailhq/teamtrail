import type { AgentSessionDoc } from '../agents/agentLink';
import { answeredSigned } from '../agents/answeredSignature';
import { approvesHighRisk } from '../model/answerVia';

/**
 * The human's answers to questions agents asked on a ticket, with the category each was asked with. They cover only
 * high-risk path rules (policyViolations.ts), so only an answer given in the Lookout counts, as at the decision gate
 * for a high-risk call: not one given in Slack or an agent's chat, nor one from before answers kept how they were
 * given. An fyi answer covers nothing, nor does a record from before answers kept their category, or an entry this
 * machine didn't sign.
 */
export function answeredTickets(docs: AgentSessionDoc[], root: string) {
  return docs.flatMap((d) =>
    d.answered.flatMap((a) => {
      const ticketId = a.ticketId ?? d.session.ticketId;
      if (!ticketId || !a.category || a.urgency === 'fyi' || !approvesHighRisk(a.via)) return [];
      // The doc is a file the agent can write: only an entry Teamtrail signed when it delivered the answer counts.
      if (a.sessionId !== d.session.id || !answeredSigned(root, a)) return [];
      return [{ mapId: a.mapId || d.session.mapId, ticketId, category: a.category }];
    }),
  );
}
