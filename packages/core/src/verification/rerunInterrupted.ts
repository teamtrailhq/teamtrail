import type { MapSnapshot } from '../model/types';
import type { VerificationAttempt } from '../model/verification';
import { submissionOf } from './resubmit';
import { levelFor, verify, type VerifyEnv } from './verifyCompletion';

/**
 * Starts a fresh attempt for a run whose process died, from the submission its lock kept. The commands that run are
 * the approved ones, as for any run (verifyCompletion.ts): nothing a stale lock file names.
 */
export async function rerun(env: VerifyEnv, snap: MapSnapshot, interrupted: VerificationAttempt) {
  const t = snap.tickets.find((x) => x.id === interrupted.ticketId);
  if (!t || t.state !== 'open' || t.status !== 'verifying') return undefined;
  const { info } = levelFor(env.root, snap, t);
  return verify(env, {
    mapId: snap.map.id,
    ticket: t,
    info,
    sub: { ...submissionOf(interrupted), remote: interrupted.remote },
  });
}
