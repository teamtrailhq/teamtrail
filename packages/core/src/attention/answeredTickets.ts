import type { AgentSessionDoc } from '../agents/agentLink';
import { approvesGates } from '../model/answerVia';

/**
 * The human's answers to questions agents asked on a ticket, with the category each was asked with. An fyi answer
 * covers nothing, as at the decision gate; a record from before answers kept their category covers nothing either,
 * and neither does an answer given in an agent's chat, or one from before answers kept how they were given.
 */
export function answeredTickets(docs: AgentSessionDoc[]) {
  return docs.flatMap((d) =>
    d.answered.flatMap((a) => {
      const ticketId = a.ticketId ?? d.session.ticketId;
      if (!ticketId || !a.category || a.urgency === 'fyi' || !approvesGates(a.via)) return [];
      return [{ mapId: a.mapId || d.session.mapId, ticketId, category: a.category }];
    }),
  );
}
