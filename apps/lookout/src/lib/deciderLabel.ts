import type { DecisionRecord } from '@teamtrail/core';
import { actorLabel, type SlackPeople } from './actorLabel';

/** Who made a decision, as a person: their name when the sign-in recorded it, with the role it was made in. */
export function deciderLabel(d: Pick<DecisionRecord, 'decidedBy' | 'decidedByName'>, people?: SlackPeople): string {
  const role = actorLabel(d.decidedBy, people);
  return d.decidedByName ? `${d.decidedByName} (${role})` : role;
}
