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
  state: 'Accepting signs it as yours on this machine: gates then read the file as it is',
  discovery:
    'Agents may claim its implementation tickets without a discovery brief, and criteria are no longer required',
};

/** What approving does not cover, where it matters; shown in full under the item. */
export const KIND_CAVEAT: Partial<Record<TrustKind, string>> = {
  checks: 'Approval covers these commands, not what they run: scripts and config they read can still change.',
  catalogs:
    'Approval covers where guides come from, not the guides: each one is still shown whole and approved on its own.',
};

/** Whether an item shows its text whole: free text nobody committed. Check commands always show as their diff. */
export function shownWhole(item: TrustItem): boolean {
  return item.committed === false && item.kind !== 'checks';
}

/** Why an item waits, said once. */
export function standingText(item: TrustItem): string {
  if (item.kind === 'state') return stateStanding(item);
  if (shownWhole(item)) return 'Not committed, so shown whole';
  if (item.standing !== 'elsewhere') return 'Changed since you approved it here';
  return item.committed === false
    ? 'Never approved on this machine'
    : 'Came with the repo, never approved on this machine';
}

/** Why a trail file waits: it was changed outside Teamtrail, which on this machine is never taken as yours. */
function stateStanding(item: TrustItem): string {
  const who = 'Changed by a teammate or an agent outside Teamtrail';
  if (item.standing === 'elsewhere') return `${who}, or came with the repo · never signed on this machine`;
  return item.committed === false ? `${who} · not committed` : who;
}

/** What holds while trail files changed outside Teamtrail wait, said once above them. */
export const STATE_NOTE =
  "Until you decide, Teamtrail uses the values it signed: a changed ticket is held for you, and an unsigned decision doesn't count. Accept signs the change as yours on this machine; Revert writes the signed values back.";

/** The opening line when committed items are waiting: a clone, a teammate, or an upgrade. */
export function adoptLine(n: number) {
  const things = n === 1 ? 'thing' : 'things';
  return `${n} committed ${things} say they were approved, or record a trail's state, but this machine never signed them: a fresh clone, a teammate's push, or an upgrade. Look them over, then approve them in one step. After that, only what Teamtrail writes here and what you approve one at a time counts.`;
}

/** What approving here covers, in the section's opening. */
export const APPROVAL_POINTS = [
  'Covered: the commands checks run, where trails are kept, what needs you, how much work is checked, and accepted briefs, criteria and knowledge.',
  "A trail's state changed by editing files instead of through Teamtrail (a ticket closed, claimed or retyped, a level changed, a decision written) counts only once you accept it.",
];

/** What the trust here stops, and what it doesn't, behind Learn more. */
export const LIMITS = [
  'Approvals are kept in your config folder, never in the repo. A repo moved to another folder is asked again.',
  "This stops an agent that can only write files in the repo, and a teammate's push. A teammate's push shows as changed outside Teamtrail until you accept it here.",
  'It does not stop an agent that can read your home folder: it can read the key. Any local agent can answer questions with answer_question.',
  "An agent whose sandbox can write your config folder can approve for itself (teamtrail approve --hash, or approvals.json) and forge the record of a trail's state. Where the sandbox blocks that folder, Teamtrail fails closed.",
];
