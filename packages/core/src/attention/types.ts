import type { TicketLease } from '../agents/ticketLease';
import type { DiscoveryBrief } from '../discovery/brief';
import type { KnowledgeEntry } from '../knowledge/knowledge';
import type { AttentionItem, AttentionKind, AttentionPolicy, AttentionState } from '../model/attention';
import type { InstalledGuide } from '../model/guide';
import type { TicketSync } from '../model/prEvidence';
import type { RerouteProposal } from '../model/reroute';
import type { MapSnapshot, PendingQuestion, SessionInfo } from '../model/types';
import type { RerouteSuggestion } from '../planning/reroute/rerouteTriggers';
import type { PolicyViolation } from '../policy/policyViolations';
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
