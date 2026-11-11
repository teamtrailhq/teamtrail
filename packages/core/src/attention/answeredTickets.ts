import type { AgentSessionDoc } from '../agents/agentLink';
import { answeredSigned } from '../agents/answeredSignature';
import { approvesGates } from '../model/answerVia';

/**
 * The human's answers to questions agents asked on a ticket, with the category each was asked with. An fyi answer
 * covers nothing, as at the decision gate; a record from before answers kept their category covers nothing either,
 * and neither does an answer given in an agent's chat, or one from before answers kept how they were given, or an
 * entry this machine didn't sign.
 */
export function answeredTickets(docs: AgentSessionDoc[], root: string) {
  return docs.flatMap((d) =>
    d.answered.flatMap((a) => {
      const ticketId = a.ticketId ?? d.session.ticketId;
      if (!ticketId || !a.category || a.urgency === 'fyi' || !approvesGates(a.via)) return [];
      // The doc is a file the agent can write: only an entry Teamtrail signed when it delivered the answer counts.
      if (a.sessionId !== d.session.id || !answeredSigned(root, a)) return [];
      return [{ mapId: a.mapId || d.session.mapId, ticketId, category: a.category }];
    }),
  );
}
