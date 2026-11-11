import { ticketPhase } from '../planning/lifecycle/phase';
import { transition } from '../planning/lifecycle/transition';
import { OperationError } from '../planning/operations/operationError';
import { checksApproval, checksWaitReason, ChecksNotApproved } from './checksApproval';
import { readAttempts } from './evidenceStore';
import { submissionOf } from './resubmit';
import { levelFor, verify, type VerifyEnv } from './verifyCompletion';

/**
 * The trail lead runs a ticket's checks again on its last submission: a verifying
 * ticket is re-verified, a blocked one goes back to verifying first. Returns once
 * the run has started; `done` settles with the outcome.
 */
export async function rerunChecks(
  env: VerifyEnv,
  req: { mapId: string; ticketId: string; by: string; reason?: string },
) {
  const { mapId, ticketId, by, reason } = req;
  const snap = await env.adapter.loadMap(mapId);
  const t = snap.tickets.find((x) => x.id === ticketId);
  if (!t) throw new OperationError(`ticket ${ticketId} not found`);
  // nothing moves while the commands wait: the trail lead approves them first, then re-runs
  const approval = checksApproval(env.root);
  if (approval.waiting) throw new ChecksNotApproved(checksWaitReason(approval));
  const last = readAttempts(env.root, mapId, ticketId).at(-1);
  if (!last) throw new OperationError(`${t.key} has no submission to verify again`);
  const phase = ticketPhase(t, new Map(snap.tickets.map((x) => [x.id, x])), snap.map.mode);
  if (phase !== 'verifying' && phase !== 'blocked')
    throw new OperationError(`${t.key} is ${phase}; only verifying or blocked tickets can be re-run`);
  const actor = {
    actor: by,
    actorKind: 'trail lead' as const,
    reason: reason || 'checks re-run by the trail lead',
    journal: env.journal,
  };
  await transition(
    env.adapter,
    mapId,
    ticketId,
    phase === 'blocked'
      ? { ...actor, event: 'unblock', to: 'verifying', expect: 'blocked' }
      : { ...actor, event: 'reverify', expect: 'verifying' },
  );
  const { info } = levelFor(env.root, snap, t);
  return verify(env, { mapId, ticket: { ...t, status: 'verifying' }, info, sub: submissionOf(last) });
}
