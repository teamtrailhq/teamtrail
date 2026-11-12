import {
  approvesGates,
  approvesHighRisk,
  oneLine,
  OperationError,
  type AnswerVia,
  type DecisionRisk,
  type RiskCategory,
  type Ticket,
  type TranscriptEntry,
} from '@teamtrail/core';
import { needsLookout } from '@teamtrail/core/agents';
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
  /** The risk categories the question was asked with; empty when none. */
  categories: RiskCategory[];
  /** How much the agent said it needed the answer. */
  urgency: 'blocking' | 'soon' | 'fyi';
  /** The conversation the answer was given in. */
  transcript: TranscriptEntry[];
  /**
   * How it was given (answerVia.ts). Only `lookout` and `slack` answers back the human's decisions; a `chat` one,
   * or one without a label (from before labels), only guides.
   */
  via?: AnswerVia;
  /** For `chat`: the agent whose chat it was given in. */
  chatOf?: string;
  /** What it backed, once used. */
  usedFor?: string;
}

/** What a chat answer is for, as the agent is told when it gets one and when it offers one at a gate. */
export const CHAT_GUIDES =
  "Answers given in an agent's chat guide agents but can't approve this; answer in the Lookout or Slack. Use it as guidance; for a decision that is the human's (high risk, a HITL ticket, questionId), ask again with ask_human and have them answer in the Lookout or Slack.";

/** What an agent is told of a Slack answer to a question the risk policy makes high risk. */
export const SLACK_HIGH_RISK =
  'Answered in Slack, and the question is high risk: it guides you, but backs no decision. For the decision, ask again with ask_human and have the human answer in the Lookout.';

/** The refusal for an answer given in a chat (or before labels existed) offered at a gate. */
function chatRefusal(a: HumanAnswer) {
  const where =
    a.via === 'chat'
      ? `in ${a.chatOf ?? 'an agent'}'s chat`
      : 'before answers recorded where they were given, so it counts as given in a chat';
  return `Question ${a.questionId} was answered ${where}. ${CHAT_GUIDES}`;
}

/** The refusal for a Slack answer offered for a high-risk call: only the Lookout's answer counts for those. */
export function lookoutOnly(a: { questionId: string }) {
  return `Question ${a.questionId} was answered in Slack, and this decision is high risk: only an answer given in the Lookout counts for it (Slack answers pass through Teamtrail's Scout service). Ask again with ask_human and have the human answer in the Lookout.`;
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
 * The categories the question must have been asked with: the one the decision declares and, for a high-risk
 * call, every category the policy found at that level (the files can make it "schema" whatever is declared).
 */
function categoriesNeeded(w: Wanted, high: boolean): RiskCategory[] {
  const fromRisk = high ? [w.risk?.category, ...(w.risk?.also ?? [])] : [];
  return [...new Set([w.category, ...fromRisk])].filter((c): c is RiskCategory => !!c);
}

/** How a question's categories read in a refusal. */
function askedWith(categories: RiskCategory[]) {
  if (!categories.length) return 'without a category';
  const list = categories.map((c) => `"${c}"`).join(' and ');
  return categories.length > 1 ? `with categories ${list}` : `with category ${list}`;
}

/** The refusal for an answer asked about something else, naming every category the decision needs. */
function mismatch(m: { q: string; asked: string; missing: RiskCategory; needs: RiskCategory[] }) {
  const several = m.needs.length > 1;
  const all = m.needs.map((c) => `"${c}"`).join(' and ');
  const which = several ? ` (it is ${all})` : '';
  const split = several ? ', and record one decision per category' : '';
  return `${m.q} was asked ${m.asked}, and this decision is "${m.missing}"${which}. Ask again with category "${m.missing}", so the human knows what they are deciding${split}.`;
}

/**
 * Why this answer can't back that decision. An answer covers what it was asked about: its ticket, its category,
 * and, for a high-risk call (by category or by the files touched) or a ticket that is the human's to decide, a
 * question the human was told mattered: one asked with that risk's category, and not as an fyi.
 */
function refusal(a: HumanAnswer, w: Wanted, root: string): string | undefined {
  const q = `Question ${a.questionId}`;
  // Any local agent can call answer_question, one that answers its own question included: only an answer given in
  // the Lookout or Slack is the human's word at a gate.
  if (!approvesGates(a.via)) return chatRefusal(a);
  if (a.usedFor) return `${q} already backs ${a.usedFor}: one answer, one decision. Ask again for another one.`;
  if (w.ticket && a.ticketId !== w.ticket.id)
    return `${q} was not asked on ${w.ticket.key}. Ask the human about ${w.ticket.key} while you hold it.`;
  const high = w.risk?.level === 'high';
  // High by the decision, or by what the question itself was asked with: a Slack answer backs neither.
  if ((high || needsLookout.question(root, { categories: a.categories })) && !approvesHighRisk(a.via))
    return lookoutOnly(a);
  const asked = askedWith(a.categories);
  const needs = categoriesNeeded(w, high);
  const missing = needs.find((c) => !a.categories.includes(c));
  if (missing) return mismatch({ q, asked, missing, needs });
  if (high && !needs.length)
    return `${q} can't back this: the decision is high risk by its files (${w.risk?.reason}) and names no category. Record it with the category you asked with, or ask again with the category it falls under.`;
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
  const why = refusal(a, w, ctx.root);
  if (why) throw new OperationError(why);
  return a;
}

const latestFor = (ctx: AgentContext, w: Wanted) =>
  w.ticket ? [...ctx.answers.values()].filter((a) => refusal(a, w, ctx.root) === undefined).at(-1) : undefined;

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
