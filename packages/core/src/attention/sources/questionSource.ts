import { questionHeadline } from '../../model/questionHeadline';
import type { PendingQuestion, SessionInfo } from '../../model/types';
import type { AttentionSource, Candidate } from '../types';
import { waitsOnHuman } from '../waitsOnHuman';

/**
 * Old clients don't send urgency and their ask_human call blocks until answered, so the agent is idle.
 * Agents that say `soon` or `fyi` keep working on something else meanwhile.
 */
function idleOn(q: PendingQuestion, session?: SessionInfo): boolean {
  if (session?.status !== 'running' || session.waitingOn !== q.id) return false;
  return q.urgency === undefined || q.urgency === 'blocking';
}

/**
 * Open agent questions that still wait on the human (waitsOnHuman.ts: one answered in an agent's chat leaves the
 * queue unless a gate or the agent waits for their own answer). Questions in one trail are a batch: the human
 * answers them in one sitting.
 */
export const questionSource: AttentionSource = {
  kind: 'question',
  collect({ questions, sessions, snaps }) {
    const byId = new Map(sessions.map((s) => [s.id, s]));
    const ticketOf = (q: PendingQuestion) =>
      snaps.find((s) => s.map.id === q.mapId)?.tickets.find((t) => t.id === q.ticketId);
    const waiting = questions.filter((q) => waitsOnHuman(q, { ticket: ticketOf(q), session: byId.get(q.sessionId) }));
    return waiting.map((q): Candidate => ({
      kind: 'question',
      mapId: q.mapId,
      ticketId: q.ticketId,
      // The agent's headline, else the first sentence: the full question is the body where it is answered.
      title: questionHeadline(q).text,
      since: q.at,
      urgency: q.urgency ?? 'soon',
      ref: q.id,
      agent: q.agent,
      holds: [...new Set([q.ticketId, ...(q.blocks ?? [])].filter((t): t is string => !!t))],
      idleAgent: idleOn(q, byId.get(q.sessionId)) ? q.agent : undefined,
      batchKey: `${q.mapId}:decide`,
    }));
  },
};
