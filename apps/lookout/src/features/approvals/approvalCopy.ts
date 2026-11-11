import type { TrustItem, TrustKind } from '@teamtrail/core';

/** What approving each kind does, in one line. */
export const KIND_EFFECT: Record<TrustKind, string> = {
  checks: 'Completions run these commands on this machine',
  policy: 'Agents may then decide these alone',
  brief: 'Implementation tickets of the trail open up',
  criteria: 'These criteria define done for the ticket',
  knowledge: 'Agents get it as trusted context with their claims',
  level: 'Completions on it are checked this much',
  type: "The trail's level applies to a ticket by its type",
  state: 'Accepting signs it as yours on this machine: gates then read the file as it is',
};

/** What approving does not cover, where it matters; shown in full under the item. */
export const KIND_CAVEAT: Partial<Record<TrustKind, string>> = {
  checks:
    'Approval covers these commands, not what they run: npm run check runs package.json scripts, and an agent can edit those.',
};

/** Why an item waits, said once. */
export function standingText(item: TrustItem): string {
  if (item.kind === 'state') return stateStanding(item);
  if (item.committed === false) return 'Not committed, so shown whole';
  return item.standing === 'elsewhere'
    ? 'Came with the repo, never approved on this machine'
    : 'Changed since you approved it here';
}

/** Why a trail file waits: it was changed outside Teamtrail, which on this machine is never taken as yours. */
function stateStanding(item: TrustItem): string {
  const who = 'Changed by a teammate or an agent outside Teamtrail';
  if (item.standing === 'elsewhere') return `${who}, or came with the repo · never signed on this machine`;
  return item.committed === false ? `${who} · not committed` : who;
}

/** What holds while trail files changed outside Teamtrail wait, said once above them. */
export const STATE_NOTE =
  'Until you decide, Teamtrail uses the values it signed: a changed ticket is held for you, and a decision nobody signed here does not count. Accept signs the change as yours on this machine; Revert writes the signed values back into the file.';

/** The opening line when committed items are waiting: a clone, a teammate, or an upgrade. */
export function adoptLine(n: number) {
  const things = n === 1 ? 'thing' : 'things';
  return `${n} committed ${things} in this repo say they were approved, or record a trail's state, but nothing on this machine signed them: a fresh clone, a teammate's push, or an upgrade from before they were kept per machine. Look them over, then approve them in one step. After that, only what Teamtrail writes here, and what you approve one at a time, counts.`;
}

/** What the trust here stops, and what it doesn't. */
export const LIMITS = [
  'Kept in your config folder, never in the repo',
  'A repo moved to another folder is asked again',
  "This stops an agent that can only write files in the repo, and a teammate's push. An agent that can read your home folder can read the key, and any local agent can answer questions with answer_question",
  'An agent whose sandbox can write your config folder can approve for itself (teamtrail approve --hash, or approvals.json); where the sandbox blocks that folder, Teamtrail fails closed',
  "A trail's state (ticket types, states, claims, blockers, levels, the trail's mode, decisions, assumptions) counts only as Teamtrail wrote it here, so a teammate's push shows as changed outside Teamtrail until you accept it on this machine. An agent that can write your config folder can forge that record too",
];
