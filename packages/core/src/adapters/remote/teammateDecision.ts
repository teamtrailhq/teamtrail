import { oneLine } from '../../model/safeText';
import type { DecisionRecord } from '../../model/types';
import { madeBy } from '../../planning/decisions/decisionRecord';
import type { Writer } from './writer';

/**
 * A teammate's id, kept apart from this machine's own and from each other's: `D-9` posted by GitHub's mona reads
 * as `D-9@mona`, by a Linear user as `D-9@<their user id>`. The key is unique in the tracker, so ids never collide.
 */
const theirId = (id: string, key: string) => `${id}@${key.replace(/[^A-Za-z0-9_-]/g, '_') || 'someone'}`;

/**
 * A record another tracker account posted: still a decision, but that person's. Whatever names it carries, every
 * person in it is shown as that account: their human (or anyone human-looking: "Trail lead", `slack:U…`) as
 * `@mona`, their agents as `claude-07 (@mona)`. Its id and links get `@mona`, so it never shares an id with one of
 * this machine's records nor shadows one. `postedBy` keeps it from counting as this machine's human anywhere.
 */
export function teammateDecision(d: DecisionRecord, o: { writer: Writer; tracker: string }): DecisionRecord {
  const name = o.writer.name || 'someone';
  const key = o.writer.key ?? name;
  const agent = (id: string) => `${oneLine(id)} (${o.writer.handle ?? name})`;
  const human = new Set(d.transcript.filter((e) => e.from === 'human').map((e) => e.author));
  const byAgent = madeBy(d) === 'agent';
  if (!byAgent) human.add(d.decidedBy);
  const person = (id: string) => (human.has(id) ? name : agent(id));
  const participants = [...new Set(d.participants.map((p) => person(p.id)))].map((id) => ({ id }));
  return {
    ...d,
    id: theirId(d.id, key),
    ...(d.supersedes ? { supersedes: theirId(d.supersedes, key) } : {}),
    ...(d.supersededBy ? { supersededBy: theirId(d.supersededBy, key) } : {}),
    decidedBy: byAgent ? agent(d.decidedBy) : name,
    participants,
    transcript: d.transcript.map((e) => ({ ...e, author: e.from === 'human' ? name : agent(e.author) })),
    postedBy: name,
    postedIn: o.tracker,
  };
}
