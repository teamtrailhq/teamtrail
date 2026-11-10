import { oneLine, OperationError, type RiskCategory, type Ticket, type TranscriptEntry } from '@teamtrail/core';
import type { AgentContext } from './agentContext';

/**
 * An answer the human gave to a question this agent asked. It is the only thing that makes a decision the
 * human's, and it is tied to what was asked: the question's own words, the ticket it was asked on, the risk
 * category it was asked with. It backs one decision, then it is used up.
 */
export interface HumanAnswer {
  questionId: string;
  /** The question as the human read it. */
  question: string;
  /** Their answer, word for word. */
  answer: string;
  author: string;
  at: number;
  mapId: string;
  /** The ticket the asking session was working on; none for framing questions. */
  ticketId?: string;
  category?: RiskCategory;
  /** The conversation the answer was given in. */
  transcript: TranscriptEntry[];
  /** What it backed, once used. */
  usedFor?: string;
}

interface Wanted {
  /** Named by the agent; without it only a close looks for the answer to a question asked on its ticket. */
  questionId?: string;
  /** Closing this ticket: the question must have been asked on it. */
  ticket?: Ticket;
  /** The category the decision declares: the question must have been asked with the same one. */
  category?: RiskCategory;
}

const fits = (a: HumanAnswer, w: Wanted) =>
  !a.usedFor && (!w.ticket || a.ticketId === w.ticket.id) && (!w.category || a.category === w.category);

function refusal(a: HumanAnswer, w: Wanted): string | undefined {
  const q = `Question ${a.questionId}`;
  if (a.usedFor) return `${q} already backs ${a.usedFor}: one answer, one decision. Ask again for another one.`;
  if (w.ticket && a.ticketId !== w.ticket.id)
    return `${q} was not asked on ${w.ticket.key}. Ask the human about ${w.ticket.key} while you hold it.`;
  if (w.category && a.category !== w.category)
    return `${q} was asked ${a.category ? `with category "${a.category}"` : 'without a category'}, and this decision is "${w.category}". Ask again with category "${w.category}", so the human knows what they are deciding.`;
  return undefined;
}

/**
 * The human's answer behind a decision, or undefined when the decision is the agent's own. A named question
 * must fit or the call is refused; unnamed, a close takes the latest unused answer to a question asked on its
 * ticket (with its category, when it declares one).
 */
export function humanAnswerFor(ctx: AgentContext, w: Wanted): HumanAnswer | undefined {
  if (w.questionId) {
    const named = ctx.answers.get(w.questionId);
    if (!named)
      throw new OperationError(
        `No answer on record for question ${w.questionId}. It has to be a question you asked with ask_human on this connection, answered by the human.`,
      );
    const why = refusal(named, w);
    if (why) throw new OperationError(why);
    return named;
  }
  if (!w.ticket) return undefined;
  return [...ctx.answers.values()].filter((a) => fits(a, w)).at(-1);
}

/**
 * The record of a decision the human made: the question as asked and their own words as the answer. What the
 * agent wrote is its reading of that, and is kept as such, in the rationale.
 */
export function humanDecision(a: HumanAnswer, by: { agent: string; said: string; rationale?: string }) {
  const reading = by.said.trim() === a.answer.trim() ? '' : `${by.agent}'s reading: ${by.said.trim()}`;
  return {
    decidedBy: a.author,
    question: a.question,
    answer: a.answer,
    summary: `${oneLine(a.answer).slice(0, 100)} (asked: ${oneLine(a.question).slice(0, 100)})`,
    rationale: [by.rationale?.trim(), reading].filter(Boolean).join('\n\n'),
    transcript: a.transcript,
  };
}
