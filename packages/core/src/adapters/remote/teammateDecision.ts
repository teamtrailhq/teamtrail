import { oneLine } from '../../model/safeText';
import type { DecisionRecord } from '../../model/types';
import { madeBy } from '../../planning/decisions/decisionRecord';

/** `mona` → `mona`; anything that can't sit in an id → `-`. */
const slug = (name: string) => name.replace(/[^A-Za-z0-9_-]+/g, '-') || 'someone';

/** A teammate's id, kept apart from this machine's own: `D-9` posted by mona reads as `D-9@mona`. */
const theirId = (id: string, name: string) => `${id}@${slug(name)}`;

/**
 * A record another tracker account posted: still a decision, but that person's. Whatever names it carries, every
 * person in it is shown as that account: their human (or anyone human-looking: "Trail lead", `slack:U…`) as
 * `mona`, their agents as `claude-07 (mona)`. Its id and links get `@mona`, so it never shares an id with one of
 * this machine's records nor shadows one. `postedBy` keeps it from counting as this machine's human anywhere.
 */
export function teammateDecision(d: DecisionRecord, o: { name: string; tracker: string }): DecisionRecord {
  const name = o.name || 'someone';
  const agent = (id: string) => `${oneLine(id)} (${name})`;
  const human = new Set(d.transcript.filter((e) => e.from === 'human').map((e) => e.author));
  const byAgent = madeBy(d) === 'agent';
  if (!byAgent) human.add(d.decidedBy);
  const person = (id: string) => (human.has(id) ? name : agent(id));
  const participants = [...new Set(d.participants.map((p) => person(p.id)))].map((id) => ({ id }));
  return {
    ...d,
    id: theirId(d.id, name),
    ...(d.supersedes ? { supersedes: theirId(d.supersedes, name) } : {}),
    ...(d.supersededBy ? { supersededBy: theirId(d.supersededBy, name) } : {}),
    decidedBy: byAgent ? agent(d.decidedBy) : name,
    participants,
    transcript: d.transcript.map((e) => ({ ...e, author: e.from === 'human' ? name : agent(e.author) })),
    postedBy: name,
    postedIn: o.tracker,
  };
}
