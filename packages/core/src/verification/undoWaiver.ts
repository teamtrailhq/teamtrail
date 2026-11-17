import { journalFile } from '../history/journalFile';
import type { AnswerVia } from '../model/answerVia';
import type { CheckWaiver } from '../model/checkWaiver';
import { highRiskRefusal } from '../model/highRiskRefusal';
import type { Ticket } from '../model/types';
import { transition } from '../planning/lifecycle/transition';
import { supersedeDecision } from '../planning/operations/decisionOps';
import { OperationError } from '../planning/operations/operationError';
import { ticketNeedsLookout } from '../policy/ticketNeedsLookout';
import { activeWaivers } from './activeWaivers';
import { checkWaivers } from './checkWaivers';
import type { VerifyEnv } from './verifyCompletion';

const TRAIL_LEAD = 'trail lead';

/**
 * Undoes the trail lead's "Accept without <check>" on a ticket: its checks all run again on the next completion,
 * and the decision is superseded by this one. A ticket that closed on it goes back in the queue (`reopen`), since its
 * proof leaned on the waiver. Journaled. Never from Slack or an agent's chat.
 */
export async function undoWaiver(
  env: VerifyEnv,
  r: { mapId: string; ticketId: string; person?: string; via: AnswerVia },
): Promise<{ undone: string[] }> {
  if (r.via === 'slack' || r.via === 'chat') throw new OperationError('Undo it in the Lookout.');
  const snap = await env.adapter.loadMap(r.mapId);
  const t = snap.tickets.find((x) => x.id === r.ticketId);
  if (!t) throw new OperationError(`ticket ${r.ticketId} not found`);
  if (!activeWaivers(env.root, r.mapId, t.id).length) throw new OperationError(`${t.key} has no waived check to undo.`);
  // the decision it supersedes is high risk when its ticket is: the same rule as superseding it any other way
  if (r.via !== 'lookout' && (await ticketNeedsLookout(env.root, r.mapId, t.id)))
    throw new OperationError(highRiskRefusal(t.key, r.via));
  const by = r.person ?? TRAIL_LEAD;
  const undone = checkWaivers.undo(env.root, { mapId: r.mapId, ticketId: t.id, by });
  const names = [...new Set(undone.flatMap((w) => w.checks.map((c) => c.name)))].join(', ');
  for (const w of undone) {
    journal(env.root, { w, t, by });
    await supersede(env, { w, t, r, names });
  }
  await env.adapter.comment(r.mapId, t.id, TRAIL_LEAD, `**${names} runs again**\n\n${by} undid accepting it without.`);
  if (t.state === 'closed' && t.closeReason === 'completed')
    await transition(env.adapter, r.mapId, t.id, {
      event: 'reopen',
      actor: by,
      actorKind: 'trail lead',
      reason: `undid accepting it without ${names}`,
      journal: env.journal,
    });
  return { undone: undone.map((w) => w.id) };
}

function journal(root: string, o: { w: CheckWaiver; t: Ticket; by: string }) {
  journalFile(root).append({
    v: 1,
    kind: 'waiver',
    at: Date.now(),
    mapId: o.w.mapId,
    ticketId: o.t.id,
    ticketKey: o.t.key,
    action: 'undone',
    waiver: o.w.id,
    checks: o.w.checks.map((c) => c.name),
    actor: o.by,
    actorKind: 'trail lead',
  });
}

/** The waiver's decision, replaced by the trail lead's undoing it. */
async function supersede(
  env: VerifyEnv,
  o: { w: CheckWaiver; t: Ticket; r: { mapId: string; person?: string; via: AnswerVia }; names: string },
) {
  const { w, t, r } = o;
  if (!w.decisionId) return;
  const old = (await env.adapter.listDecisions(r.mapId)).find((d) => d.id === w.decisionId);
  if (!old || old.supersededBy) return;
  await supersedeDecision(env.adapter, r.mapId, old.id, {
    ticketId: t.id,
    ticketKey: t.key,
    answer: `Run ${o.names} again.`,
    summary: `${t.key} runs ${o.names} again`,
    decidedBy: TRAIL_LEAD,
    ...(r.person ? { decidedByName: r.person } : {}),
    source: { kind: 'lookout', label: 'Undid accepting without a check' },
    transcript: [],
    guard: { via: r.via, highRisk: (mapId, ticketId) => ticketNeedsLookout(env.root, mapId, ticketId) },
  });
}
