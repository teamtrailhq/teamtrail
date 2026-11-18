import { discoverySkipped } from '../discovery/discoveryGate';
import type { MainRunEnv } from '../mainChecks/startMainRun';
import type { TrailProof } from '../model/trailProof';
import type { DecisionRecord, MapSnapshot } from '../model/types';
import { listReroutes } from '../planning/reroute/rerouteStore';
import { readTrailChecks } from '../trailChecks/readTrailChecks';
import { buildTrailProof } from './buildTrailProof';
import { proofForTicket } from './proofForTicket';

/**
 * The proof of a whole trail from what this machine recorded: each done ticket's proof, the pending reroutes and the
 * combined run on the default branch (read only: asking for a proof never starts a run). `decisions` is the trail's
 * whole list.
 */
export async function trailProofFor(input: {
  env: MainRunEnv;
  snap: MapSnapshot;
  decisions: DecisionRecord[];
}): Promise<TrailProof> {
  const { env, snap } = input;
  const done = snap.tickets.filter((t) => t.state === 'closed' && t.closeReason === 'completed');
  const proofs = done.map((ticket) => proofForTicket({ root: env.root, snap, ticket, decisions: input.decisions }));
  const view = await readTrailChecks(env, snap);
  return buildTrailProof({
    trail: { id: snap.map.id, title: snap.map.title },
    tickets: snap.tickets,
    proofs,
    pendingReroutes: listReroutes(env.root, snap.map.id).filter((r) => r.status === 'pending').length,
    together: view.together,
    discoverySkipped: discoverySkipped(env.root, snap.map.id),
    ...(view.run ? { run: view.run } : {}),
  });
}
