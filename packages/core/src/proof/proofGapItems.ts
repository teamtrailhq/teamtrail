import { guardReason } from '../checkGuard/guardReason';
import { flakyLine } from '../flaky/flakyReason';
import { heldAsFlaky } from '../flaky/heldAsFlaky';
import type { ProofReview } from '../model/proof';
import type { ProofGapItem, ProofGapKind } from '../model/proofGap';
import type { VerificationAttempt } from '../model/verification';

const gap = (kind: ProofGapKind, text: string): ProofGapItem => ({ kind, text });
const all = (kind: ProofGapKind, texts: string[]) => texts.map((t) => gap(kind, t));

/** Why no completion of this ticket can be proven at all; undefined when its attempt is worth grading. */
function cannotProve(attempt: VerificationAttempt | undefined): ProofGapItem[] | undefined {
  if (!attempt) return [gap('no-completion', 'No completion was submitted for this ticket.')];
  if (attempt.level === 'off')
    return [gap('verification-off', 'Verification is off for this ticket, so nothing was checked.')];
  // A remote completion counts only when the embedding server's runner ran its checks where its work is, on a commit.
  if (attempt.remote && !attempt.runner)
    return [gap('remote-unchecked', 'Submitted from another machine: no check ran here and no git was read.')];
  if (attempt.runner && !attempt.git?.tree?.head)
    return [gap('runner-no-commit', `${attempt.runner} named no commit the checks ran on.`)];
  return undefined;
}

/** A pass the flaky gate held counts once the trail lead accepted it; until then each retried check is a gap. */
function retriedGaps(attempt: VerificationAttempt, reviews: ProofReview[]): string[] {
  if (!heldAsFlaky(attempt) || reviews.some((r) => r.byKind === 'trail lead' && r.verdict === 'PASS')) return [];
  return (attempt.flaky?.checks ?? []).map((f) => `${flakyLine(f)}; the trail lead hasn't accepted the pass.`);
}

/** A pass the check guard held, until the trail lead accepts it (their PASS on the attempt). */
function guardGap(a: VerificationAttempt, reviews: ProofReview[]): string[] {
  if (a.result !== 'pass' || a.guard?.mode !== 'enforce') return [];
  if (reviews.some((r) => r.byKind === 'trail lead' && r.verdict === 'PASS')) return [];
  return [`The work changed what its checks run: ${guardReason(a.guard.findings)}.`];
}

/** Why no review counts as independent: a PASS the `independent-review` gate held names the shared model. */
function noIndependentReview(reviews: ProofReview[]): string {
  const held = reviews.find((r) => r.sameModel === 'held' && r.verdict === 'PASS');
  if (!held) return 'No independent review passed it.';
  const on = held.model ? ` on ${held.model}` : '';
  return `No independent review passed it: ${held.by} reviewed it${on}, the model that did the work.`;
}

/** A diff rule's question nobody answered, or that the trail lead let the work go without. */
const ruleGaps = (a: VerificationAttempt): ProofGapItem[] =>
  (a.rules ?? []).flatMap((r) => {
    if (r.unanswered) return [gap('rule-unanswered', `${r.id}'s question went unanswered: ${r.ask}`)];
    if (r.waived)
      return [gap('rule-waived', `${r.id}'s question wasn't answered: ${r.waived.by} let the work go without it.`)];
    return [];
  });

/** What the checks and the criteria found on the attempt itself. */
function attemptGaps(attempt: VerificationAttempt, reviews: ProofReview[]): ProofGapItem[] {
  const gaps: ProofGapItem[] = [];
  if (attempt.result !== 'pass') gaps.push(gap('checks-failed', `The checks didn't pass (${attempt.result}).`));
  const known = attempt.knownFailures?.map((k) => k.name) ?? [];
  if (known.length) gaps.push(gap('known-failures', `Known failures, already failing on main: ${known.join(', ')}.`));
  for (const w of attempt.waived ?? [])
    gaps.push(gap('waived-check', `${w.name} didn't run: ${w.by} accepted the work without it.`));
  gaps.push(...all('retried', retriedGaps(attempt, reviews)), ...all('check-guard', guardGap(attempt, reviews)));
  const c = attempt.criteria;
  if (c?.missing.length)
    gaps.push(gap('criteria-missing-evidence', `Criteria with no evidence: ${c.missing.join(', ')}.`));
  if (c?.failed.length) gaps.push(gap('criteria-failed', `Criteria whose check failed: ${c.failed.join(', ')}.`));
  if (c && c.confirmed === false)
    gaps.push(gap('criteria-unconfirmed', "The trail lead hadn't confirmed the criteria."));
  return [...gaps, ...ruleGaps(attempt)];
}

/** What the reviews and the trail lead's approval the level asks for still lack. */
function reviewGaps(attempt: VerificationAttempt, reviews: ProofReview[]): ProofGapItem[] {
  const gaps: ProofGapItem[] = [];
  if (reviews.some((r) => r.verdict !== 'PASS'))
    gaps.push(gap('review-not-pass', 'A review or the trail lead did not pass it.'));
  if (attempt.level !== 'checks' && !reviews.some((r) => r.byKind === 'agent' && r.verdict === 'PASS' && r.independent))
    gaps.push(gap('no-independent-review', noIndependentReview(reviews)));
  const approved = reviews.some((r) => r.byKind === 'trail lead' && r.verdict === 'PASS');
  if (attempt.level === 'checks+review+human' && !approved)
    gaps.push(gap('trail-lead-not-approved', "The trail lead hasn't approved it."));
  return gaps;
}

/**
 * Why a ticket's latest completion isn't proven, one gap each with its kind; none means it is. Deterministic: the same
 * attempt and reviews always give the same gaps. What the level asks for: `checks` a passing run here, `+review` an
 * independent agent's PASS, `+human` the trail lead's PASS; any FAIL or NEEDS_HUMAN on the attempt stands until a new
 * attempt.
 */
export function proofGapItems(input: { attempt?: VerificationAttempt; reviews: ProofReview[] }): ProofGapItem[] {
  const { attempt, reviews } = input;
  const unproven = cannotProve(attempt);
  if (unproven || !attempt) return unproven ?? [];
  return [...attemptGaps(attempt, reviews), ...reviewGaps(attempt, reviews)];
}
