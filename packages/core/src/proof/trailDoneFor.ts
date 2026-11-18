import { discoverySkipped } from '../discovery/discoveryGate';
import type { MainRunEnv } from '../mainChecks/startMainRun';
import type { TrailDone } from '../model/trailDone';
import type { DecisionRecord, MapSnapshot } from '../model/types';
import { listReroutes } from '../planning/reroute/rerouteStore';
import { trailDone } from '../planning/trailDone';
import { readTrailChecks } from '../trailChecks/readTrailChecks';
import { proofForTicket } from './proofForTicket';

/**
 * Whether a trail is done, from what this machine recorded, with the same inputs the Lookout judges it by: each done
 * ticket's proof, the pending reroutes, the combined run on the default branch and whether discovery was skipped
 * here. What the MCP tools tell an agent, so agents and the Lookout agree. Read only: it never starts a run.
 */
export async function trailDoneFor(input: {
  env: MainRunEnv;
  snap: MapSnapshot;
  decisions: DecisionRecord[];
}): Promise<TrailDone> {
  const { env, snap } = input;
  const done = snap.tickets.filter((t) => t.state === 'closed' && t.closeReason === 'completed');
  const proofs = Object.fromEntries(
    done.map((ticket) => [
      ticket.id,
      proofForTicket({ root: env.root, snap, ticket, decisions: input.decisions }).status,
    ]),
  );
  const view = await readTrailChecks(env, snap);
  return trailDone({
    tickets: snap.tickets,
    proofs,
    pendingReroutes: listReroutes(env.root, snap.map.id).filter((r) => r.status === 'pending').length,
    together: view.together,
    discoverySkipped: discoverySkipped(env.root, snap.map.id),
  });
}
