import type { TrackerAdapter } from '../adapters/adapter';
import { reportsSettings } from '../adapters/remote/settingsLedger';
import { legacyOutbox } from '../adapters/remote/legacyOutbox';
import { readAgentDocs } from '../agents/agentDocs';
import { connectedAgents } from '../agents/connectedAgents';
import { readLeases } from '../agents/leaseStore';
import { readDeliveryProblems } from '../delivery/deliveryStore';
import { readBrief } from '../discovery/briefStore';
import { readTicketSyncs } from '../evidence/syncStore';
import { listGuides } from '../guides/guideStore';
import { listKnowledge } from '../knowledge/knowledgeStore';
import type { AttentionPolicy } from '../model/attention';
import { trackerPin, trackerTargetKey, trackerTargetLabel } from '../server/trackerPin';
import { pendingTrust } from '../trust/pendingTrust';
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
    ...(reportsSettings(adapter)
      ? { trackerSettings: adapter.unacceptedSettings(), trackerSettingsSkipped: adapter.settingsSkipped() }
      : {}),
    agents: connectedAgents(docs),
    deliveries: readDeliveryProblems(root),
    trust: pendingTrust(root, snaps),
    ...oldQueue(root),
    ...trackerWaiting(root),
    policy,
    state: readAttentionState(root),
    now,
  };
}

/** Writes an earlier version queued in the repo: shown to the trail lead, never sent on their own. */
function oldQueue(root: string) {
  const { writes, targets } = legacyOutbox(root).list();
  return writes ? { legacyOutbox: { writes, targets } } : {};
}

/** The tracker trackers.json asks for when it isn't the one approved on this machine. */
function trackerWaiting(root: string) {
  const { config, pending } = trackerPin(root).read();
  if (!pending) return {};
  const trackerPending = {
    target: trackerTargetKey(pending),
    label: trackerTargetLabel(pending),
    approved: trackerTargetLabel(config),
  };
  return { trackerPending };
}

function integrationsOf(root: string) {
  const scan = readIntegrationScan(root);
  return scan.overlaps.map((o) => ({ ...o, at: scan.at }));
}
