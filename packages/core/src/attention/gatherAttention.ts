import type { TrackerAdapter } from '../adapters/adapter';
import { reportsSettings } from '../adapters/remote/settingsLedger';
import { readAgentDocs } from '../agents/agentDocs';
import { connectedAgents } from '../agents/connectedAgents';
import { readLeases } from '../agents/leaseStore';
import { readDeliveryProblems } from '../delivery/deliveryStore';
import { readBrief } from '../discovery/briefStore';
import { readTicketSyncs } from '../evidence/syncStore';
import { listGuides } from '../guides/guideStore';
import { listKnowledge } from '../knowledge/knowledgeStore';
import type { AttentionPolicy } from '../model/attention';
import { approvalItems } from '../verification/approvals';
import { readIntegrationScan } from '../workspaces/integrationStore';
import { readAttentionState } from './attentionStore';
import { readViolations } from './readViolations';
import { rerouteInputs } from './rerouteInputs';
import type { AttentionInput } from './types';

/** Reads everything the queue is built from: the tracker, agent session docs and the local evidence. */
export async function gatherAttention(input: {
  root: string;
  adapter: TrackerAdapter;
  policy: AttentionPolicy;
  now: number;
}): Promise<AttentionInput> {
  const { root, adapter, policy, now } = input;
  const maps = await adapter.listMaps();
  const snaps = await Promise.all(maps.map((m) => adapter.loadMap(m.id)));
  const docs = await readAgentDocs(root);
  const briefs = snaps.map((s) => readBrief(root, s.map.id)).filter((b) => b !== undefined);
  const syncs = readTicketSyncs(root).filter((s) => s.flags.length);
  return {
    snaps,
    questions: docs.flatMap((d) => d.pending),
    sessions: docs.map((d) => d.session),
    approvals: snaps.flatMap((s) => approvalItems(root, s)),
    syncs,
    leases: readLeases(root),
    knowledge: listKnowledge(root),
    briefs,
    ...(await rerouteInputs({ root, adapter, snaps, syncs })),
    violations: await readViolations({ root, adapter, snaps, docs }),
    integrations: integrationsOf(root),
    guides: listGuides(root).filter((r) => r.origin === 'local'),
    trackerSettings: reportsSettings(adapter) ? adapter.unacceptedSettings() : [],
    agents: connectedAgents(docs),
    deliveries: readDeliveryProblems(root),
    policy,
    state: readAttentionState(root),
    now,
  };
}

function integrationsOf(root: string) {
  const scan = readIntegrationScan(root);
  return scan.overlaps.map((o) => ({ ...o, at: scan.at }));
}
