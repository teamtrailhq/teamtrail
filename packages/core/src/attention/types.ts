import type { UnacceptedSettings } from '../adapters/remote/settingsInForce';
import type { RefusedWrite } from '../adapters/remote/sync/types';
import type { PendingTracker } from '../adapters/remote/types';
import type { TicketLease } from '../agents/ticketLease';
import type { CriteriaWaiting } from '../criteria/criteriaHeld';
import type { DiscoveryBrief } from '../discovery/brief';
import type { KnowledgeEntry } from '../knowledge/knowledge';
import type { AttentionItem, AttentionKind, AttentionPolicy, AttentionState } from '../model/attention';
import type { DeliveryProblem } from '../model/delivery';
import type { Escape } from '../model/escape';
import type { InstalledGuide } from '../model/guide';
import type { MainChecksView } from '../model/mainChecks';
import type { TicketSync } from '../model/prEvidence';
import type { RerouteProposal } from '../model/reroute';
import type { TrailChecksView } from '../model/trailChecks';
import type { MapSnapshot, PendingQuestion, SessionInfo } from '../model/types';
import type { ConnectedAgent } from '../planning/matching/modelWaits';
import type { RerouteSuggestion } from '../planning/reroute/rerouteTriggers';
import type { PolicyViolation } from '../policy/policyViolations';
import type { PrecedentConflict } from '../precedent/precedentConflicts';
import type { RepoReadiness } from '../model/readiness';
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
  /** PR/CI snapshots with open mismatch flags or an open pull request. */
  syncs: (Pick<TicketSync, 'mapId' | 'ticketId' | 'ticketKey' | 'flags'> &
    Partial<Pick<TicketSync, 'pr' | 'checksSummary'>>)[];
  leases: TicketLease[];
  knowledge: KnowledgeEntry[];
  briefs: DiscoveryBrief[];
  /** Pending reroute proposals with the tickets each freezes. Missing: none. */
  reroutes?: { proposal: RerouteProposal; frozen: string[] }[];
  /** Signs a reroute may be needed (rerouteTriggers). Missing: none. */
  suggestions?: RerouteSuggestion[];
  /** High-risk changes made without the human (policy/policyViolations.ts). Missing: none. */
  violations?: PolicyViolation[];
  /** Verified work that changed files an earlier decision of the human's covers (precedent/). Missing: none. */
  precedentConflicts?: PrecedentConflict[];
  /** Verified work that came back: reopened or reverted (scorecard/findEscapes.ts). Missing: none. */
  escapes?: Escape[];
  /** Active claim branches that changed the same files (workspaces/scanIntegrations.ts). Missing: none. */
  integrations?: IntegrationOverlap[];
  /** Checks on main per active trail (mainChecks/). Missing: none. */
  mainChecks?: MainChecksView[];
  /** The combined run on main per active trail (trailChecks/). Missing: none. */
  trailChecks?: TrailChecksView[];
  /** Installed guides, checked against the lock (guides/guideStore.ts). Missing: none. */
  guides?: InstalledGuide[];
  /** Connectors whose messages are being refused (delivery/deliveryStore.ts). Missing: none. */
  deliveries?: DeliveryProblem[];
  /** Settings someone else wrote into a tracked issue that this machine hasn't accepted. Missing: none. */
  trackerSettings?: UnacceptedSettings[];
  /** Writes GitHub or Linear refused for good, kept on this machine (adapters/remote/refusedWrites.ts). Missing: none. */
  trackerRefused?: RefusedWrite[];
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
  /** Tickets whose criteria wait for the trail lead before work starts (criteria/criteriaHeld.ts). Missing: none. */
  criteria?: CriteriaWaiting[];
  /**
   * Repo readiness (readiness/) and, per active trail, the ready tickets its blocking findings hold. Missing: none.
   */
  readiness?: { readiness: RepoReadiness; held: { mapId: string; tickets: string[] }[] };
  /** Missing: the defaults. */
  policy?: AttentionPolicy;
  /** Missing: nothing snoozed or dismissed. */
  state?: AttentionState;
  now: number;
}

/** What a source says about one thing that needs the human; scoring and batching turn it into an item. */
export interface Candidate extends Pick<
  AttentionItem,
  'kind' | 'mapId' | 'ticketId' | 'title' | 'since' | 'urgency' | 'ref' | 'agent' | 'rule' | 'url'
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
