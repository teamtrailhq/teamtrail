import { dropBrief } from '../../discovery/briefStore';
import { createKnowledge, listKnowledge } from '../../knowledge/knowledgeStore';
import type { Assumption } from '../../model/assumption';
import type { RerouteProposal } from '../../model/reroute';
import { recordTypes } from '../../verification/approvedLevel';
import { settleAssumptions } from '../assumptions/assumptionOps';
import { OperationError } from '../operations/operationError';
import { applyReroute } from './applyReroute';
import { recordSettingDecision } from './recordSettingDecision';
import { approvedReroute, keepApprovedReroute, keepRerouteProgress, rerouteHash } from './rerouteApproval';
import { journal, RerouteInvalid, type RerouteEnv } from './rerouteFlow';
import { readReroute, writeReroute } from './rerouteStore';
import { validateReroute } from './validateReroute';

export interface RerouteDecision {
  mapId: string;
  id: string;
  /** The trail lead's actor id. */
  by: string;
  note?: string;
  now?: number;
  /** `rerouteHash` of the proposal the trail lead looked at; the bridge always sends it. A file that differs is refused. */
  hash?: string;
}

/**
 * The trail lead approves a proposal: it is checked again against the map as it is now, marked approved, applied
 * through the existing operations (resumable), and the assumptions it invalidates are settled and kept as suggested
 * `dead-end` knowledge. Approving an approved proposal that didn't finish applying finishes it. The approval is of
 * the proposal's content (rerouteApproval.ts): what is applied is exactly what was approved here.
 */
export async function approveReroute(env: RerouteEnv, d: RerouteDecision): Promise<RerouteProposal> {
  const found = readOrThrow(env, d);
  // An approval is this machine's record, not the file's status: without one, "approved" in the file resumes nothing.
  const kept = found.status === 'approved' ? approvedReroute(env.root, found) : undefined;
  if (found.status === 'approved' && !kept)
    throw new OperationError(`${found.id} says approved, but the trail lead never approved it on this machine`);
  const resuming = !!kept && kept.applied.length < kept.changes.length;
  if (found.status !== 'pending' && !resuming) throw new OperationError(`${found.id} is ${found.status}`);
  let p = kept ?? found;
  if (!resuming) {
    if (d.hash !== undefined && d.hash !== rerouteHash(found))
      throw new OperationError(`${found.id} changed since you looked at it. Review it again before approving.`);
    const snap = await env.adapter.loadMap(d.mapId);
    const errors = validateReroute(snap, await env.adapter.listDecisions(d.mapId), p);
    if (errors.length) throw new RerouteInvalid(errors);
    p = {
      ...p,
      status: 'approved',
      decidedBy: d.by,
      decidedAt: d.now ?? Date.now(),
      note: d.note?.trim() || undefined,
    };
    keepApprovedReroute(env.root, p, d.by);
    writeReroute(env.root, p);
    journal(env, p, { action: 'approved', actor: d.by, actorKind: 'trail lead', reason: p.note });
  }
  // what runs is the approved content kept on this machine; the file only mirrors the progress
  const save = (x: RerouteProposal) => {
    keepRerouteProgress(env.root, x, d.by);
    writeReroute(env.root, x);
  };
  const dropping = { dropBrief: (mapId: string) => dropBrief(env.root, mapId) };
  p = await applyReroute({ adapter: env.adapter, actor: d.by, journal: env.journal, save, ...dropping }, p);
  // the tickets it added keep the type they were created with, for their trail's level (approvedLevel.ts)
  const created = new Set(Object.values(p.created));
  if (created.size)
    recordTypes(
      env.root,
      d.mapId,
      (await env.adapter.loadMap(d.mapId)).tickets.filter((t) => created.has(t.id)),
    );
  journal(env, p, { action: 'applied', actor: d.by, actorKind: 'trail lead', changes: p.applied.length });
  if (p.lane === 'setting' && !resuming) await recordSettingDecision(env, p, d.by);
  const invalidated = await settleAssumptions(env.adapter, d.mapId, {
    ids: p.invalidates,
    status: 'invalidated',
    rerouteId: p.id,
  });
  keepAsKnowledge(env, p, invalidated);
  return p;
}

/** The trail lead rejects a proposal, with the note the agent gets; challenged assumptions it listed hold again. */
export async function rejectReroute(env: RerouteEnv, d: RerouteDecision): Promise<RerouteProposal> {
  const note = d.note?.trim();
  if (!note) throw new OperationError('say why: the note goes back to the agent');
  const found = readOrThrow(env, d);
  if (found.status !== 'pending') throw new OperationError(`${found.id} is ${found.status}`);
  const p: RerouteProposal = { ...found, status: 'rejected', decidedBy: d.by, decidedAt: d.now ?? Date.now(), note };
  writeReroute(env.root, p);
  journal(env, p, { action: 'rejected', actor: d.by, actorKind: 'trail lead', reason: note });
  await settleAssumptions(env.adapter, d.mapId, { ids: p.invalidates, status: 'holding', rerouteId: p.id });
  return p;
}

function readOrThrow(env: RerouteEnv, d: Pick<RerouteDecision, 'mapId' | 'id'>) {
  const p = readReroute(env.root, d.mapId, d.id);
  if (!p) throw new OperationError(`no proposal ${d.id} on this trail`);
  return p;
}

/** Each invalidated assumption becomes a suggested `dead-end` entry the trail lead can review; never twice. */
function keepAsKnowledge(env: RerouteEnv, p: RerouteProposal, invalidated: Assumption[]) {
  const existing = new Set(listKnowledge(env.root).flatMap((e) => e.sources));
  for (const a of invalidated) {
    const source = `reroute:${p.mapId}/${p.id}/${a.id}`;
    if (existing.has(source)) continue;
    const now = Date.now();
    createKnowledge(env.root, {
      title: `Didn't hold: ${a.text}`.slice(0, 160),
      body: [`The trail assumed: ${a.text}`, `Why it doesn't hold: ${p.reason}`, `Evidence: ${p.evidence}`].join(
        '\n\n',
      ),
      kind: 'dead-end',
      status: 'suggested',
      scope: [],
      tags: ['assumption'],
      sources: [source],
      anchors: [],
      createdBy: p.by,
      createdAt: now,
      updatedAt: now,
    });
  }
}
