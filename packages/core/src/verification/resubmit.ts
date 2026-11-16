import type { VerificationAttempt } from '../model/verification';
import type { Submission } from './verifyCompletion';

/** The submission an attempt kept, to run its checks again. */
export const submissionOf = (a: VerificationAttempt): Submission => ({
  agent: a.agent,
  sessionId: a.sessionId,
  origin: a.origin,
  declaredPaths: a.declaredPaths,
  touches: a.touches,
  resolution: a.resolution,
  summary: a.summary,
  rationale: a.rationale,
  alternatives: a.alternatives,
  noCodeReason: a.noCodeReason,
  pr: a.pr,
  // A remote attempt stays remote: its checks run again on the runner, or nowhere, never on this checkout.
  ...(a.remote ? { remote: true } : {}),
  criteria: a.criteria?.evidence,
});
