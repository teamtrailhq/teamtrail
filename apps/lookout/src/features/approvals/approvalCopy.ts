import type { TrustItem, TrustKind } from '@teamtrail/core';

/** What approving each kind does, in one line. */
export const KIND_EFFECT: Record<TrustKind, string> = {
  checks: 'Completions run these commands on this machine',
  catalogs: 'Guides can then be searched for and added from these addresses',
  policy: 'Agents may then decide these alone',
  brief: 'Implementation tickets of the trail open up',
  criteria: 'These criteria define done for the ticket',
  knowledge: 'Agents get it as trusted context with their claims',
  level: 'Completions on it are checked this much',
  type: "The trail's level applies to a ticket by its type",
  discovery:
    'Agents may claim its implementation tickets without a discovery brief, and criteria are no longer required',
};

/** What approving does not cover, where it matters; shown in full under the item. */
export const KIND_CAVEAT: Partial<Record<TrustKind, string>> = {
  checks:
    'Approval covers these commands, not what they run: npm run check runs package.json scripts, and an agent can edit those.',
  catalogs:
    'Approval covers where guides come from, not the guides: each one is still shown whole and approved on its own.',
};

/** Why an item waits, said once. */
export function standingText(item: TrustItem): string {
  if (item.committed === false) return 'Not committed, so shown whole';
  return item.standing === 'elsewhere'
    ? 'Came with the repo, never approved on this machine'
    : 'Changed since you approved it here';
}

/** The opening line when committed items are waiting: a clone, a teammate, or an upgrade. */
export function adoptLine(n: number) {
  const things = n === 1 ? 'thing' : 'things';
  return `${n} committed ${things} in this repo say they were approved, but not on this machine: a fresh clone, a teammate's push, or approvals made before they were kept per machine. Look them over, then approve them in one step.`;
}

/** What the trust here stops, and what it doesn't. */
export const LIMITS = [
  'Kept in your config folder, never in the repo',
  'A repo moved to another folder is asked again',
  "This stops an agent that can only write files in the repo, and a teammate's push. An agent that can read your home folder can read the key, and any local agent can answer questions with answer_question",
  'An agent whose sandbox can write your config folder can approve for itself (teamtrail approve --hash, or approvals.json); where the sandbox blocks that folder, Teamtrail fails closed',
];
