import type { UnacceptedSettings } from '../adapters/remote/settingsInForce';
import type { PendingTracker } from '../adapters/remote/types';
import type { TicketLease } from '../agents/ticketLease';
import type { DiscoveryBrief } from '../discovery/brief';
import type { KnowledgeEntry } from '../knowledge/knowledge';
import type { AttentionItem, AttentionKind, AttentionPolicy, AttentionState } from '../model/attention';
import type { DeliveryProblem } from '../model/delivery';
import type { InstalledGuide } from '../model/guide';
import type { TicketSync } from '../model/prEvidence';
import type { RerouteProposal } from '../model/reroute';
import type { MapSnapshot, PendingQuestion, SessionInfo } from '../model/types';
import type { ConnectedAgent } from '../planning/matching/modelWaits';
import type { RerouteSuggestion } from '../planning/reroute/rerouteTriggers';
import type { PolicyViolation } from '../policy/policyViolations';
import type { TrustItem } from '../trust/trustItem';
import type { ApprovalItem } from '../verification/approvals';
import type { IntegrationOverlap } from '../workspaces/workspace';

/** Everything the queue is built from, already read from disk; `buildAttention` is pure over it. */
export interface AttentionInput {
  snaps: MapSnapshot[];
  /** Open questions from every agent session. */
  questions: PendingQuestion[];
  sessions: SessionInfo[];
  /** Tickets waiting on the trail lead (verification/approvals.ts). */
  approvals: ApprovalItem[];
  /** PR/CI snapshots with their open mismatch flags. */
  syncs: Pick<TicketSync, 'mapId' | 'ticketId' | 'ticketKey' | 'flags'>[];
  leases: TicketLease[];
  knowledge: KnowledgeEntry[];
  briefs: DiscoveryBrief[];
  /** Pending reroute proposals with the tickets each freezes. Missing: none. */
  reroutes?: { proposal: RerouteProposal; frozen: string[] }[];
  /** Signs a reroute may be needed (rerouteTriggers). Missing: none. */
  suggestions?: RerouteSuggestion[];
  /** High-risk changes made without the human (policy/policyViolations.ts). Missing: none. */
  violations?: PolicyViolation[];
  /** Active claim branches that changed the same files (workspaces/scanIntegrations.ts). Missing: none. */
  integrations?: IntegrationOverlap[];
  /** Installed guides, checked against the lock (guides/guideStore.ts). Missing: none. */
  guides?: InstalledGuide[];
  /** Connectors whose messages are being refused (delivery/deliveryStore.ts). Missing: none. */
  deliveries?: DeliveryProblem[];
  /** Settings someone else wrote into a tracked issue that this machine hasn't accepted. Missing: none. */
  trackerSettings?: UnacceptedSettings[];
  /** When the record of accepted tracker settings last couldn't be written (it was locked). Missing: never. */
  trackerSettingsSkipped?: number;
  /** What the repo's files ask this machine to trust, not approved here (trust/pendingTrust.ts). Missing: none. */
  trust?: TrustItem[];
  /** trackers.json names another tracker than the one approved here (server/trackerPin.ts). Missing: none. */
  trackerPending?: PendingTracker;
  /** Tracker writes an earlier version queued in the repo, never sent without the trail lead. Missing: none. */
  legacyOutbox?: { writes: number; targets: string[] };
  /** Agents connected now, with their model tier (model matching). Missing: none. */
  agents?: ConnectedAgent[];
  /** Missing: the defaults. */
  policy?: AttentionPolicy;
  /** Missing: nothing snoozed or dismissed. */
  state?: AttentionState;
  now: number;
}

/** What a source says about one thing that needs the human; scoring and batching turn it into an item. */
export interface Candidate extends Pick<
  AttentionItem,
  'kind' | 'mapId' | 'ticketId' | 'title' | 'since' | 'urgency' | 'ref' | 'agent'
> {
  /** Tickets that can't move until this is handled; their open dependents count too. */
  holds: string[];
  /** The agent sitting idle until this is handled. */
  idleAgent?: string;
  /** Reasons only the source knows, shown first. */
  notes?: string[];
  /** Defaults to `<mapId>:<kind>`. */
  batchKey?: string;
}

/** One kind of attention item. Register new sources in `sources/registry.ts`. */
export interface AttentionSource {
  kind: AttentionKind;
  collect(input: AttentionInput): Candidate[];
}
