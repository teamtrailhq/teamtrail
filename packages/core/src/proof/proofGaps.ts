import { guardReason } from '../checkGuard/guardReason';
import type { ProofReview } from '../model/proof';
import type { VerificationAttempt } from '../model/verification';

/** Why no completion of this ticket can be proven at all; undefined when its attempt is worth grading. */
function cannotProve(attempt: VerificationAttempt | undefined): string[] | undefined {
  if (!attempt) return ['No completion was submitted for this ticket.'];
  if (attempt.level === 'off') return ['Verification is off for this ticket, so nothing was checked.'];
  // A remote completion counts only when the embedding server's runner ran its checks where its work is, on a commit.
  if (attempt.remote && !attempt.runner)
    return ['Submitted from another machine: no check ran here and no git was read.'];
  if (attempt.runner && !attempt.git?.tree?.head) return [`${attempt.runner} named no commit the checks ran on.`];
  return undefined;
}

/** A pass the check guard held, until the trail lead accepts it (their PASS on the attempt). */
function guardGap(a: VerificationAttempt, reviews: ProofReview[]): string[] {
  if (a.result !== 'pass' || a.guard?.mode !== 'enforce') return [];
  if (reviews.some((r) => r.byKind === 'trail lead' && r.verdict === 'PASS')) return [];
  return [`The work changed what its checks run: ${guardReason(a.guard.findings)}.`];
}

/** A diff rule's question nobody answered, or that the trail lead let the work go without. */
const ruleGaps = (a: VerificationAttempt) =>
  (a.rules ?? []).flatMap((r) => {
    if (r.unanswered) return [`${r.id}'s question went unanswered: ${r.ask}`];
    if (r.waived) return [`${r.id}'s question wasn't answered: ${r.waived.by} let the work go without it.`];
    return [];
  });

/**
 * Why a ticket's latest completion isn't proven, one line each; none means it is. Deterministic: the same attempt and
 * reviews always give the same lines. What the level asks for: `checks` a passing run here, `+review` an independent
 * agent's PASS, `+human` the trail lead's PASS; any FAIL or NEEDS_HUMAN on the attempt stands until a new attempt.
 */
export function proofGaps({ attempt, reviews }: { attempt?: VerificationAttempt; reviews: ProofReview[] }): string[] {
  const unproven = cannotProve(attempt);
  if (unproven) return unproven;
  if (!attempt) return [];
  const gaps: string[] = [];
  if (attempt.result !== 'pass') gaps.push(`The checks didn't pass (${attempt.result}).`);
  const known = attempt.knownFailures?.map((k) => k.name) ?? [];
  if (known.length) gaps.push(`Known failures, already failing on main: ${known.join(', ')}.`);
  for (const w of attempt.waived ?? []) gaps.push(`${w.name} didn't run: ${w.by} accepted the work without it.`);
  gaps.push(...guardGap(attempt, reviews));
  const c = attempt.criteria;
  if (c?.missing.length) gaps.push(`Criteria with no evidence: ${c.missing.join(', ')}.`);
  if (c?.failed.length) gaps.push(`Criteria whose check failed: ${c.failed.join(', ')}.`);
  if (c && c.confirmed === false) gaps.push("The trail lead hadn't confirmed the criteria.");
  gaps.push(...ruleGaps(attempt));
  if (reviews.some((r) => r.verdict !== 'PASS')) gaps.push('A review or the trail lead did not pass it.');
  if (attempt.level !== 'checks' && !reviews.some((r) => r.byKind === 'agent' && r.verdict === 'PASS' && r.independent))
    gaps.push('No independent review passed it.');
  if (
    attempt.level === 'checks+review+human' &&
    !reviews.some((r) => r.byKind === 'trail lead' && r.verdict === 'PASS')
  )
    gaps.push("The trail lead hasn't approved it.");
  return gaps;
}
