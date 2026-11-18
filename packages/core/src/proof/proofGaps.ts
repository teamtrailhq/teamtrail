import type { ProofReview } from '../model/proof';
import type { VerificationAttempt } from '../model/verification';
import { proofGapItems } from './proofGapItems';

/** Why a ticket's latest completion isn't proven, one line each (proofGapItems); none means it is. */
export const proofGaps = (input: { attempt?: VerificationAttempt; reviews: ProofReview[] }): string[] =>
  proofGapItems(input).map((g) => g.text);
