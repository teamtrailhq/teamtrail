import {
  oneLine,
  OperationError,
  type DecisionRisk,
  type RiskCategory,
  type Ticket,
  type TranscriptEntry,
} from '@teamtrail/core';
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
  /** How much the agent said it needed the answer. */
  urgency: 'blocking' | 'soon' | 'fyi';
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
  /** What the policy makes of the decision, from its category and its files. */
  risk?: DecisionRisk;
  /** The answer has to carry weight: it closes a ticket that is the human's to decide. */
  hitl?: boolean;
}

/** Held by a call that is still writing its decision; a second call finds the answer taken. */
const IN_USE = 'a decision being recorded now';

/**
 * Why this answer can't back that decision. An answer covers what it was asked about: its ticket, its category,
 * and, for a high-risk call (by category or by the files touched) or a ticket that is the human's to decide, a
 * question the human was told mattered: one asked with that risk's category, and not as an fyi.
 */
function refusal(a: HumanAnswer, w: Wanted): string | undefined {
  const q = `Question ${a.questionId}`;
  if (a.usedFor) return `${q} already backs ${a.usedFor}: one answer, one decision. Ask again for another one.`;
  if (w.ticket && a.ticketId !== w.ticket.id)
    return `${q} was not asked on ${w.ticket.key}. Ask the human about ${w.ticket.key} while you hold it.`;
  const high = w.risk?.level === 'high';
  const needs = w.category ?? (high ? w.risk?.category : undefined);
  const asked = a.category ? `with category "${a.category}"` : 'without a category';
  if (needs && a.category !== needs)
    return `${q} was asked ${asked}, and this decision is "${needs}". Ask again with category "${needs}", so the human knows what they are deciding.`;
  if (high && !a.category)
    return `${q} was asked without a category, and this decision is high risk (${w.risk?.reason}). Ask again with the category it falls under, so the human knows what they are deciding.`;
  if ((high || w.hitl) && a.urgency === 'fyi')
    return `${q} was asked as an fyi. A decision that is the human's to make needs a question asked as soon or blocking.`;
  return undefined;
}

/**
 * The human's answer behind a decision, or undefined when the decision is the agent's own. A named question
 * must fit or the call is refused; unnamed, a close takes the latest unused answer to a question asked on its
 * ticket that fits. The answer is taken on the spot, before anything is awaited, so two calls at once can't
 * both have it: the caller ends with `spend` (it backed something) or `release` (the call failed).
 */
export function humanAnswerFor(ctx: AgentContext, w: Wanted): HumanAnswer | undefined {
  const found = w.questionId ? named(ctx, w) : latestFor(ctx, w);
  if (found) found.usedFor = IN_USE;
  return found;
}

function named(ctx: AgentContext, w: Wanted) {
  const a = ctx.answers.get(w.questionId!);
  if (!a)
    throw new OperationError(
      `No answer on record for question ${w.questionId}. It has to be a question you asked with ask_human on this connection, answered by the human.`,
    );
  const why = refusal(a, w);
  if (why) throw new OperationError(why);
  return a;
}

const latestFor = (ctx: AgentContext, w: Wanted) =>
  w.ticket ? [...ctx.answers.values()].filter((a) => refusal(a, w) === undefined).at(-1) : undefined;

/** The answer backed a decision: it is used up, and says for what. */
export function spend(a: HumanAnswer | undefined, what: string) {
  if (a) a.usedFor = what;
}

/** The call that took the answer failed before recording anything: the answer is free again. */
export function release(a: HumanAnswer | undefined) {
  if (a?.usedFor === IN_USE) a.usedFor = undefined;
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
