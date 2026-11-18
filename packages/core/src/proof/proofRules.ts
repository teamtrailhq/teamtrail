import type { ProofRule } from '../model/proof';
import type { VerificationAttempt } from '../model/verification';
import { checkPassed } from '../verification/runCheck';

const FILES_SHOWN = 10;

/**
 * The diff rules the attempt's changed files matched, as the proof shows them: each rule's check as it ran (verified
 * here), its question with the agent's answer (claimed, its word), the trail lead's waiver, or that nobody answered.
 * Missing when no rule matched, so older proofs and digests read as they did.
 */
export function proofRules(a?: VerificationAttempt): ProofRule[] | undefined {
  if (!a?.rules?.length) return undefined;
  return a.rules.map((r) => {
    const ran = r.check ? a.checks.find((c) => c.name === r.check) : undefined;
    return {
      id: r.id,
      why: r.why,
      files: r.files.slice(0, FILES_SHOWN),
      ...(r.check ? { check: { name: r.check, passed: ran ? checkPassed(ran) : null } } : {}),
      ...(r.ask ? { ask: r.ask } : {}),
      ...(r.answer ? { answer: r.answer } : {}),
      ...(r.waived ? { waived: { by: r.waived.by, reason: r.waived.reason } } : {}),
      ...(r.unanswered ? { unanswered: true as const } : {}),
    };
  });
}
