import type {
  AttemptResult,
  AttentionItem,
  AttentionKind,
  DecisionRecord,
  DiscoveryBrief,
  LeaseHealth,
  MapSnapshot,
  ModelWait,
  NodeState,
  RiskLevel,
  PendingQuestion,
  SessionInfo,
  Ticket,
  TicketLease,
  TicketSync,
  TicketType,
} from '@teamtrail/core';
import type { EdgeTone } from '../../components/ui';
import type { TicketVerification } from '../../lib/verification';
import type { TicketProofView } from '../proof';
import type { WorkspaceRow } from '../workspaces';

/** The form open under the action bar, if any. */
export type Form = 'resolve' | 'rule' | 'rework' | 'accept' | 'unblock' | 'waive' | 'workspace' | 'merge' | null;

/** The one next thing the human can do on the ticket, shown as the bar's primary button. */
export type PrimaryKind =
  | 'answer'
  | 'approve'
  | 'accept'
  | 'waive'
  | 'unblock'
  | 'rework'
  | 'release'
  | 'resolve'
  | 'review-brief'
  | 'review-change'
  | 'confirm-criteria'
  | 'take-criteria'
  /** What the queue holds on it, acted on as needAction says. */
  | 'need';

/** Where a ticket stands, in words: a title, its quiet context, the edge, and the human's next action. */
export interface Standing {
  edge: EdgeTone | 'done';
  title: string;
  parts: string[];
  primary?: PrimaryKind;
}

/** The latest completion as the state line reads it. */
export interface LatestAttempt {
  result: AttemptResult;
  agent: string;
  /** Names of the checks that failed or could not run. */
  failed: string[];
  /** Held by the `flaky` gate: what passed only on retry, in words. */
  retried?: string;
  /** The checks passed and the check guard holds the pass: what the work changed of what they run, in one line. */
  guarded?: string;
}

/** What `ticketStanding` reads, gathered from what the inspector already loads. */
export interface StandingInput {
  state: NodeState;
  now: number;
  /** An open question an agent asked on the ticket. */
  question?: { agent: string; at: number };
  /** The ranked queue's first item on this ticket, with the edge the inbox gives it. */
  item?: { kind: AttentionKind; edge: EdgeTone; title?: string };
  /** Fields changed outside Teamtrail, in words: the ticket is held until the human accepts or reverts. */
  outsideChange?: string;
  lease?: { agent: string; renewedAt: number; expiresAt: number; health: LeaseHealth };
  /** Who holds the ticket, when no lease says more. */
  assignee?: string;
  /** The trail lead holds it. */
  mine: boolean;
  hitl: boolean;
  /** Held by the discovery gate: the brief's status, while it holds. */
  briefHeld?: 'writing' | 'submitted';
  modelWait?: { tier: string; best: string };
  running?: { agent: string; startedAt: number };
  latest?: LatestAttempt;
  /** A review agent or the trail lead sent it back: the verdict's summary. */
  sentBack?: string;
  /** The level takes a review, and no review passed the latest completion yet. */
  reviewWaits: boolean;
  verified?: boolean;
  openBlockers: string[];
  closedAt?: number;
  /** Something else holds it up or puts it at risk (a notice under the state line): the edge turns amber. */
  atRisk?: boolean;
}

/** What the ticket inspector loads for one ticket (useTicketView), before it is read into a standing. */
export interface LoadedTicket {
  t: Ticket;
  snap: MapSnapshot;
  state: NodeState;
  now: number;
  /** The trail lead holds the claim. */
  mine: boolean;
  lease?: TicketLease;
  /** The agent session running on the ticket. */
  session?: SessionInfo;
  question?: PendingQuestion;
  /** The queue's items on this ticket, ranked. */
  items: AttentionItem[];
  interrupting: string[];
  verification?: TicketVerification;
  proof?: TicketProofView;
  pr?: TicketSync;
  /** The PR sync's last good tick (PrSyncStatus `lastOkAt`): how fresh `pr` is. */
  prOkAt?: number;
  /** Fields changed outside Teamtrail, held until accepted or reverted. */
  change?: { fields: string[] };
  textEdited: boolean;
  /** The brief while the discovery gate holds the trail's implementation tickets, else null. */
  brief: DiscoveryBrief | null;
  modelWait?: ModelWait;
  /** A finished ticket's worktree, still on disk. */
  workspace?: WorkspaceRow;
  /** The decisions recorded on it. */
  decisions: DecisionRecord[];
}

/** What the action bar's buttons and menu items do; built by useTicketActions. */
export interface TicketRunners {
  form: (form: Exclude<Form, null>) => void;
  claim: () => void;
  release: () => void;
  releaseLease: () => void;
  approve: () => void;
  rerun: () => void;
  undoWaiver: () => void;
  criteria: (confirmed: boolean) => void;
  take: () => void;
  keep: () => void;
  editHow: () => void;
  reviewChange: () => void;
  reviewBrief: () => void;
  copyProof: () => void;
  deadEnd: () => void;
}

/** What a ticket's chips say, gathered from the ticket view (chipInput). */
export interface ChipInput {
  key: string;
  type: TicketType;
  state: NodeState;
  /** What needs the human on it, as its map card says it ("needs you", "yours to decide"): the state chip, in red. */
  need?: string;
  /** The agent at work on it, or the one whose completion it is, with its model short (`modelId` on hover). */
  agent?: { name: string; model?: string; modelId?: string; working: boolean };
  /** Its proof, when there is work to prove: verified, or why not (the first gap). */
  proof?: { verified: boolean; gap?: string };
  /** The highest risk the policy gave a call on it. */
  risk?: { level: RiskLevel; reason: string };
}

/** One chip under a ticket's title. */
export interface TicketChip {
  kind: 'key' | 'type' | 'state' | 'agent' | 'model' | 'proof' | 'risk';
  text: string;
  tone?: 'agent' | 'warn' | 'urgent' | 'verified';
  tip?: string;
}
