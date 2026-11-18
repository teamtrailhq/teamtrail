import type { Proof } from '@teamtrail/core';
import type { MetaPart } from '../../components/ui';

/** The check guard, once it no longer holds anything back (a held pass is a gap): accepted, or only observed. */
function guardPart(proof: Proof): string | false {
  const g = proof.guard;
  if (!g) return false;
  if (g.accepted) return `changed what its checks run, accepted by ${g.accepted.by}`;
  return g.mode === 'observe' && 'changed what its checks run (observed)';
}

/** The proof at a glance: checks passed, criteria, reviews, the guides it was done under, and its digest. */
export function proofParts(proof: Proof): (MetaPart | false)[] {
  const passed = proof.checks.filter((c) => c.passed).length;
  const reviews = proof.reviews.length;
  return [
    proof.checks.length > 0 && `${passed}/${proof.checks.length} checks passed`,
    !!proof.waived?.length && `${proof.waived.map((w) => w.name).join(', ')} skipped`,
    !!proof.retried?.length && `${proof.retried.map((r) => r.name).join(', ')} passed on retry`,
    guardPart(proof),
    proof.criteria.lines.length > 0 &&
      `${proof.criteria.verified} criteria verified, ${proof.criteria.claimed} claimed`,
    reviews > 0 && `${reviews} review${reviews > 1 ? 's' : ''}`,
    !!proof.guides?.length && `guides ${proof.guides.map((g) => g.id).join(', ')}`,
    { text: proof.digest.slice(0, 19), code: true },
  ];
}
