import type { Ticket } from '../model/types';
import { ticketPhase } from '../planning/lifecycle/phase';
import { transition } from '../planning/lifecycle/transition';
import { OperationError } from '../planning/operations/operationError';
import { againRefusal } from './againRefusal';
import { readAttempts } from './evidenceStore';
import { rerunChecks } from './operatorRerun';
import { submissionOf } from './resubmit';
import { levelFor, verify, type VerifyEnv } from './verifyCompletion';

/**
 * Checks a ticket's last completion again, on the same commit, once the trail lead confirmed the criteria it was
 * graded against without: a new attempt, graded against the confirmed criteria by the approved checks, with the
 * flaky gate and the check guard as on any run. A done ticket goes back to verifying (`verify-again`) and closes
 * again on a pass, replacing its earlier decision; a verifying one is re-run. Past attempts stay as they are.
 * Refused (againRefusal.ts) when anything but a regrade of the same code would be needed.
 */
export async function verifyAgain(
  env: VerifyEnv,
  r: { mapId: string; ticketId: string; by: string },
): Promise<{ attemptId: string; done: Promise<unknown> }> {
  const snap = await env.adapter.loadMap(r.mapId);
  const t = snap.tickets.find((x) => x.id === r.ticketId);
  if (!t) throw new OperationError(`ticket ${r.ticketId} not found`);
  const phase = ticketPhase(t, new Map(snap.tickets.map((x) => [x.id, x])), snap.map.mode);
  const last = readAttempts(env.root, r.mapId, t.id).at(-1);
  const refused = await againRefusal({ root: env.root, mapId: r.mapId, t, phase, last });
  if (refused || !last) throw new OperationError(refused ?? `${t.key} has no completion`);
  const reason = `criteria confirmed: ${last.id} checked again against them`;
  if (phase === 'verifying') return rerunChecks(env, { mapId: r.mapId, ticketId: t.id, by: r.by, reason });
  const decision = await ownDecision(env, r.mapId, t);
  await transition(env.adapter, r.mapId, t.id, {
    event: 'verify-again',
    actor: r.by,
    actorKind: 'trail lead',
    expect: 'done',
    reason,
    journal: env.journal,
  });
  const { info } = levelFor(env.root, snap, t);
  const sub = { ...submissionOf(last), ...(decision ? { supersedes: decision } : {}) };
  return verify(env, { mapId: r.mapId, ticket: { ...t, state: 'open', status: 'verifying' }, info, sub });
}

/** The decision the ticket's close recorded on this machine, which closing it again replaces. */
async function ownDecision(env: VerifyEnv, mapId: string, t: Ticket) {
  const all = await env.adapter.listDecisions(mapId);
  return all.filter((d) => d.ticketId === t.id && !d.supersededBy && !d.postedBy).at(-1)?.id;
}
