import type { VerificationAttempt } from '../model/verification';

/** The attempt passed only on retry and the `flaky` gate holds it: it doesn't count until the human accepts it. */
export const heldAsFlaky = (a?: Pick<VerificationAttempt, 'result' | 'flaky'>) =>
  a?.result === 'pass' && a.flaky?.mode === 'enforce';
