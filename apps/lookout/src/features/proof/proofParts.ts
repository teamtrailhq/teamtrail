import type { Proof } from '@teamtrail/core';
import type { MetaPart } from '../../components/ui';

/** The check guard, once it no longer holds anything back (a held pass is a gap): accepted, or only observed. */
function guardPart(proof: Proof): string | false {
  const g = proof.guard;
  if (!g) return false;
  if (g.accepted) return `changed what its checks run, accepted by ${g.accepted.by}`;
  return g.mode === 'observe' && 'changed what its checks run (observed)';
}

/**
 * What the proof rests on besides its check lines (ProofChecks.tsx says each check, the guard and the reviews):
 * checks that passed only on retry, the guard's acceptance, the criteria, and the guides it was done under.
 */
export function proofParts(proof: Proof): (MetaPart | false)[] {
  return [
    !!proof.retried?.length && `${proof.retried.map((r) => r.name).join(', ')} passed on retry`,
    guardPart(proof),
    proof.criteria.lines.length > 0 &&
      `${proof.criteria.verified} criteria verified, ${proof.criteria.claimed} claimed`,
    !!proof.guides?.length && `guides ${proof.guides.map((g) => g.id).join(', ')}`,
  ];
}
