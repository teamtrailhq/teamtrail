import { OperationError, type AnswerVia } from '@teamtrail/core';
import { readAgentDocs, writeAgentAnswer } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';
import { CHAT_GUIDES } from './humanAnswer';
import { TRAIL_LEAD } from './types';

/** What answer_question says when the asking agent keeps the question open for the human after it. */
const STAYS_OPEN =
  'Delivered as guidance: it decides nothing. The question stays open for the human in the Lookout or Slack; their answer there is the one used for decisions.';

/**
 * The human's words from this agent's chat, passed on to the agent that asked. Labelled `chat` here, whatever was
 * passed: it guides that agent, and never stands in for the human at a gate (answerVia.ts). It never takes the
 * place of the human's own answer either: an asking agent on this version keeps the question open for it.
 */
export async function answerQuestion(ctx: AgentContext, input: { questionId: string; answer: string }) {
  const chatOf = await ctx.agentId();
  // A question of this process's own goes in line like any other answer.
  if (ctx.activity.snapshot.pending.some((p) => p.id === input.questionId)) ctx.writer.flush();
  const doc = (await readAgentDocs(ctx.root)).find((d) => d.pending.some((q) => q.id === input.questionId));
  if (!doc) throw new OperationError(`No open question ${input.questionId}. Call list_inbox for the current ones.`);
  const written = writeAgentAnswer(ctx.root, {
    sessionId: doc.session.id,
    questionId: input.questionId,
    text: input.answer,
    author: TRAIL_LEAD,
    via: 'chat',
    chatOf,
  });
  ctx.writer.pullAnswers();
  if (written.firstAnswer)
    return { delivered: false, to: doc.session.agent, note: alreadyAnswered(written.firstAnswer) };
  const stillOpen = doc.chatGuides ? { stillOpen: true, note: STAYS_OPEN } : { note: CHAT_GUIDES };
  return { delivered: true, to: doc.session.agent, via: 'chat' as const, ...stillOpen };
}

/** What answer_question says when another answer came first: that one is used, this one kept as not used. */
const alreadyAnswered = (first: { author: string; via?: AnswerVia }) =>
  `Already answered by ${first.author}${first.via ? ` (${first.via})` : ''}: that answer is the one used. Yours is kept in the conversation, marked not used.`;
