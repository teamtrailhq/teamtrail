import type { AnswerHow } from '../model/answerVia';
import type { AnsweredQuestion, PendingQuestion } from '../model/types';

/** The record of a question answered now, with how it was given (its label and who gave it). */
export function answeredEntry(q: PendingQuestion, label: AnswerHow): AnsweredQuestion {
  return {
    id: q.id,
    mapId: q.mapId,
    sessionId: q.sessionId,
    agent: q.agent,
    askedAt: q.at,
    answeredAt: Date.now(),
    ...(q.ticketId ? { ticketId: q.ticketId } : {}),
    ...(q.category ? { category: q.category } : {}),
    ...(q.categories?.length ? { categories: q.categories } : {}),
    ...(q.urgency ? { urgency: q.urgency } : {}),
    ...label,
  };
}
