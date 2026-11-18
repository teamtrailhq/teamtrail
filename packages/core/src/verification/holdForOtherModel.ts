import type { TicketPhase } from '../model/lifecycle';
import type { Ticket } from '../model/types';
import type { VerificationAttempt, VerificationVerdict } from '../model/verification';
import { requestReview } from './reviewRequest';
import type { VerifyEnv } from './verifyCompletion';

/**
 * A PASS held by the `independent-review` gate: the reviewed ticket stays verifying, and a new review ticket waits
 * for an agent on another model. Meanwhile the trail lead can approve the work past it (approvals.ts lists it).
 */
export async function holdForOtherModel(
  env: VerifyEnv,
  o: { t: Ticket; last: VerificationAttempt; verdict: VerificationVerdict },
): Promise<{ phase: TicketPhase; held: { model: string; review?: string } }> {
  const model = o.verdict.authorModel ?? o.verdict.model ?? 'the same model';
  const note = `${o.verdict.by} already passed it on ${model}, the model that did the work. This review needs an agent on another model.`;
  const review = await requestReview(env, o.last, note);
  return { phase: 'verifying', held: { model, ...(review ? { review: review.key } : {}) } };
}
