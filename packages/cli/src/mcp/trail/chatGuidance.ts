import { BRAND, chatNote, type PendingQuestion, type QuestionGuidance, type RiskCategory } from '@teamtrail/core';
import type { AgentContext } from './agentContext';
import { CHAT_GUIDES } from './humanAnswer';
import type { AskResult } from './types';

/** What an agent is told of a chat answer to a question that stays open for the human. */
export const GUIDANCE_OPEN =
  "Answered in an agent's chat: use it as guidance; it decides nothing. The question stays open for the human in the Lookout or Slack, and their answer there is the one used: it backs decisions and HITL closes. Call wait_for_answer with this questionId to get it.";

/**
 * A question's first chat answer (answer_question), once given: put in the transcript as guidance, said by the
 * system so a decision record never takes it for the human's words, and kept as this question's answer only until
 * theirs comes (hitl.ts `ask`), so a gate offered it says why it can't approve.
 */
export function awaitGuidance(
  ctx: AgentContext,
  a: {
    q: PendingQuestion;
    question: string;
    ticketId?: string;
    categories: RiskCategory[];
    urgency: 'blocking' | 'soon' | 'fyi';
  },
): Promise<QuestionGuidance> {
  const { q } = a;
  return ctx.activity.awaitGuidance(q.id).then((g) => {
    const at = Date.now();
    const where = chatNote({ via: 'chat', chatOf: g.chatOf });
    const text = `Guidance from ${g.author} (${where}), decides nothing: ${g.text}`;
    ctx.sessions.transcript(q.sessionId)?.push({ from: 'system', author: BRAND.assistant.name, text, at });
    if (!ctx.answers.has(q.id))
      ctx.answers.set(q.id, {
        questionId: q.id,
        question: a.question,
        answer: g.text,
        author: g.author,
        at,
        mapId: q.mapId,
        ticketId: a.ticketId,
        categories: a.categories,
        urgency: a.urgency,
        transcript: ctx.sessions.transcript(q.sessionId) ?? [],
        via: 'chat',
        ...(g.chatOf ? { chatOf: g.chatOf } : {}),
      });
    return g;
  });
}

/** ask_human and wait_for_answer on a chat answer: the guidance, and that the question is still open. */
export function guidanceResult(g: QuestionGuidance): Omit<AskResult, 'questionId' | 'waitedSeconds'> {
  return {
    answered: true,
    answer: g.text,
    answeredBy: g.author,
    answeredVia: 'chat',
    stillOpen: true,
    note: `${GUIDANCE_OPEN} ${CHAT_GUIDES}`,
  };
}

/**
 * After chat guidance the question stays open but leaves the human's queue (core waitsOnHuman.ts) unless something
 * waits on their own answer: an agent calling wait_for_answer again does, so it says so while it waits.
 * Returns the undo, called when the wait ends.
 */
export function waitingAgain(ctx: AgentContext, questionId: string) {
  const q = ctx.activity.snapshot.pending.find((p) => p.id === questionId);
  if (!q?.guidance) return undefined;
  ctx.activity.waiting(q.sessionId, q.id);
  ctx.writer.flush();
  return () => {
    const s = ctx.activity.snapshot.sessions.find((x) => x.id === q.sessionId);
    if (s?.waitingOn === q.id) ctx.activity.waiting(q.sessionId, undefined);
  };
}
