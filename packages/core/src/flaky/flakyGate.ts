import type { VerificationAttempt, VerificationConfig } from '../model/verification';
import { readAttempts, writeAttempt } from '../verification/evidenceStore';
import { gateModeFor } from '../verification/gateModeFor';
import { recordGate } from '../verification/recordGate';
import { flakyReason } from './flakyReason';
import { retriedChecks } from './retriedChecks';

/**
 * The `flaky` gate on a finished attempt, before it is written: a pass whose checks failed earlier on the same code
 * gets `flaky` (and the gate is journaled). Under `enforce` the ticket then waits for the human (outcome.ts); under
 * `observe` it goes through, flagged to the reviewer and in the proof; `off` changes nothing. Only the approved
 * config sets the mode, so nothing an agent writes in the repo lifts it.
 */
export function withFlakyGate(
  root: string,
  a: VerificationAttempt,
  config: VerificationConfig | undefined,
): VerificationAttempt {
  if (a.result !== 'pass') return a;
  const mode = gateModeFor(config, 'flaky');
  if (mode === 'off') return a;
  const checks = retriedChecks(readAttempts(root, a.mapId, a.ticketId), a);
  if (!checks.length) return a;
  recordGate({
    root,
    mapId: a.mapId,
    gate: 'flaky',
    mode,
    reason: flakyReason(checks),
    ticket: { id: a.ticketId, key: a.ticketKey },
  });
  return { ...a, flaky: { mode, checks } };
}

/** Writes a finished attempt once, with the flaky gate applied, and returns it as written. */
export function writeGated(root: string, a: VerificationAttempt, config: VerificationConfig | undefined) {
  const gated = withFlakyGate(root, a, config);
  writeAttempt(root, gated);
  return gated;
}
