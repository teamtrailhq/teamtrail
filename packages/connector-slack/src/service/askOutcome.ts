import { BRAND, type AgentSessionDoc } from '@teamtrail/core';
import { clip, label } from '../blocks';

export interface AskOutcome {
  line: string;
  answered: boolean;
  /** An answer that guides the agent but decides nothing (given in its chat): the card keeps its Open link. */
  guidance?: true;
}

const quoted = (text: string | undefined) => (text ? `: “${label(clip(text, 300))}”` : '');

/**
 * What became of a question answered or dropped outside Slack, from its agent's session doc: the answer to this
 * question (never another chat after it), and how it was given. An answer passed on in the agent's own chat
 * (answer_question, `via: 'chat'`) is guidance only: it backs no decision, so the card never says the human decided.
 */
export function askOutcome(o: { doc?: AgentSessionDoc; questionId: string; agent: string }): AskOutcome {
  const { doc, questionId } = o;
  const done = (doc?.answered ?? []).find((a) => a.id === questionId);
  const reply = doc?.chats.find((c) => c.from === 'human' && c.answers === questionId);
  if (!done && !reply) {
    const why = doc?.session.status === 'running' ? 'withdrew the question' : 'session ended';
    return { line: `No longer waiting: ${label(o.agent)} ${why}.`, answered: false };
  }
  const via = done?.via ?? reply?.via;
  if (via === 'chat' || !via) {
    const where = `${label(done?.chatOf ?? reply?.chatOf ?? o.agent)}'s chat`;
    const line = `Answered in ${where}${quoted(reply?.text)}. Passed on by the agent as guidance: it decides nothing.`;
    return { line, answered: true, guidance: true };
  }
  const by = reply ? ` by ${label(reply.author)}` : '';
  return { line: `✓ Answered in ${BRAND.name}${by}${quoted(reply?.text)}.`, answered: true };
}
