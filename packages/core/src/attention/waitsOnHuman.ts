import type { PendingQuestion, SessionInfo, Ticket } from '../model/types';
import { attention } from '../planning/derive';

/**
 * Whether an open question still needs the human. A question answered in an agent's chat (answer_question) stays
 * open: a chat answer is guidance and never passes a gate. But once the human's words have reached the agent, the
 * question is settled for their queue unless their own answer, given in the Lookout or Slack, is still what something
 * waits on:
 * - a gate: it decides a HITL ticket (`stakes`, or asked on a HITL ticket, not as an fyi) or it is high risk
 *   (`lookoutOnly`);
 * - the agent: it is waiting for their answer (`wait_for_answer` after the guidance sets `waitingOn`).
 * Nothing is answered by this: the question stays open in the agent's conversation, the agent still gets the human's
 * answer if they give one, and no decision is recorded as theirs.
 */
export function waitsOnHuman(
  q: PendingQuestion,
  at: { ticket?: Pick<Ticket, 'type' | 'hitl'>; session?: SessionInfo },
) {
  if (!q.guidance) return true;
  if (q.lookoutOnly || q.stakes) return true;
  if (at.ticket && attention(at.ticket) === 'hitl' && q.urgency !== 'fyi') return true;
  return at.session?.status === 'running' && at.session.waitingOn === q.id;
}
