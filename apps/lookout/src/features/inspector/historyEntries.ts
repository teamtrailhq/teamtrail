import type { Comment, DecisionRecord } from '@teamtrail/core';
import { actorLabel, deciderLabel, type SlackPeople } from '../../lib';

/** One line of a ticket's history: a decision on it, or a comment. */
export interface HistoryEntry {
  id: string;
  at: number;
  who: string;
  kind: string;
  text: string;
  /** A decision's id, which opens it in the Logbook. */
  decision?: string;
}

const MARK = /^\*\*([^*]+)\*\*\s*/;

/** A comment's kind, from the bold mark Teamtrail starts it with: "Resolution", "Ruled out of scope", … */
function kindOf(body: string) {
  const mark = body.match(MARK)?.[1];
  if (!mark) return 'comment';
  return mark.replace(/:$/, '').toLowerCase();
}

/**
 * A ticket's decisions and comments, newest first. A resolution comment says what its decision record says, so it
 * shows once, as the decision.
 */
export function historyEntries(input: {
  comments: Comment[];
  decisions: DecisionRecord[];
  people?: SlackPeople;
}): HistoryEntry[] {
  const decided = input.decisions.map((d): HistoryEntry => ({
    id: d.id,
    at: d.decidedAt,
    who: deciderLabel(d, input.people),
    kind: d.supersededBy ? `decision, superseded by ${d.supersededBy}` : 'decision',
    text: d.summary || d.answer,
    decision: d.id,
  }));
  const comments = input.comments
    .filter((c) => !(decided.length && c.body.startsWith('**Resolution**')))
    .map((c): HistoryEntry => ({
      id: c.id,
      at: c.createdAt,
      who: actorLabel(c.author, input.people),
      kind: kindOf(c.body),
      text: c.body.replace(MARK, '').replace(/\*\*/g, ''),
    }));
  return [...decided, ...comments].sort((a, b) => b.at - a.at);
}
