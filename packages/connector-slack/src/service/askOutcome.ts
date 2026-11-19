import { BRAND, type AgentSessionDoc, type AnswerVia } from '@teamtrail/core';
import { clip, label, mention } from '../blocks';
import type { AskRecord } from '../store';

export interface AskOutcome {
  line: string;
  answered: boolean;
  /** An answer that guides the agent but decides nothing (given in its chat): the card keeps its Open link. */
  guidance?: true;
}

/** An answer as the card tells of it. */
type Said = { author: string; text?: string; via?: AnswerVia; chatOf?: string };

const quoted = (text: string | undefined) => (text ? `: “${label(clip(text, 300))}”` : '');
const SLACK_AUTHOR = /^slack:(.+)$/;

/** Who gave an answer: a Slack user as a mention, anyone else by name. */
function whoSaid(a: Said) {
  const slackUser = SLACK_AUTHOR.exec(a.author)?.[1];
  if (slackUser && a.via === 'slack') return `${mention(slackUser)} via Slack`;
  return `${label(a.author)} in ${BRAND.name}`;
}

/** The line for the answer used. */
function usedLine(a: Said, agent: string): AskOutcome {
  if (a.via === 'chat' || !a.via) {
    const where = `${label(a.chatOf ?? agent)}'s chat`;
    const line = `Answered in ${where}${quoted(a.text)}. Passed on by the agent as guidance: it decides nothing.`;
    return { line, answered: true, guidance: true };
  }
  if (a.via === 'slack' && SLACK_AUTHOR.test(a.author))
    return { line: `✓ Answered by ${whoSaid(a)}${quoted(a.text)}.`, answered: true };
  return { line: `✓ Answered in ${BRAND.name} by ${label(a.author)}${quoted(a.text)}.`, answered: true };
}

/** Answers given in an agent's chat while the question waited for the human: guidance, deciding nothing. */
const guidanceLines = (given: Said[], agent: string) =>
  given
    .map((a) => ` Guidance given earlier in ${label(a.chatOf ?? agent)}'s chat${quoted(a.text)}, deciding nothing.`)
    .join('');

/** Answers given after the one used: kept, and said to be not used. */
const notUsedLines = (later: Said[]) =>
  later.map((a) => ` Also answered by ${whoSaid(a)}${quoted(a.text)}, not used.`).join('');

/**
 * What became of a question, for its card: the answer used and how it was given, and any answer given after it,
 * which was kept but not used (agents/addAnswerFile.ts). From Slack's own record when the answer was given here
 * (`slack`), else from the agent's session doc: the answer to this question (never another chat after it). An
 * answer passed on in the agent's own chat (answer_question, `via: 'chat'`) is guidance only: it backs no
 * decision, so the card never says the human decided. One given while the question stayed open for the human
 * (`guidance`) is told as such, after the answer used.
 */
export function askOutcome(o: {
  doc?: AgentSessionDoc;
  questionId: string;
  agent: string;
  slack?: AskRecord['by'];
}): AskOutcome {
  const { doc, questionId, slack } = o;
  if (slack) return fromSlack(slack, o.agent);
  const done = (doc?.answered ?? []).find((a) => a.id === questionId);
  const replies = (doc?.chats ?? []).filter((c) => c.from === 'human' && c.answers === questionId);
  const reply = replies.find((c) => !c.notUsed && !c.guidance);
  const guided = guidanceLines(
    replies.filter((c) => c.guidance),
    o.agent,
  );
  if (!done && !reply) {
    const why = doc?.session.status === 'running' ? 'withdrew the question' : 'session ended';
    return { line: `No longer waiting: ${label(o.agent)} ${why}.${guided}`, answered: false };
  }
  const used = {
    author: reply?.author ?? 'trail lead',
    text: reply?.text,
    via: done?.via ?? reply?.via,
    chatOf: done?.chatOf ?? reply?.chatOf,
  };
  const outcome = usedLine(used, o.agent);
  return { ...outcome, line: outcome.line + guided + notUsedLines(replies.filter((c) => c.notUsed)) };
}

/** Answered from Slack: by this user, or, when another answer came first, that one, and this one not used. */
function fromSlack(by: NonNullable<AskRecord['by']>, agent: string): AskOutcome {
  const mine = { author: `slack:${by.user}`, text: by.text, via: 'slack' as const };
  if (!by.first)
    return { line: `✓ Answered by ${whoSaid(mine)}${quoted(by.text)}. ${label(agent)} resumed.`, answered: true };
  const outcome = usedLine(by.first, agent);
  return { ...outcome, line: outcome.line + notUsedLines([mine]) };
}
