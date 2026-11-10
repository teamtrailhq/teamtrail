import type {
  ChecklistAnswer,
  CriterionEvidence,
  CriterionKind,
  RiskCategory,
  TicketType,
  TrackerAdapter,
} from '@teamtrail/core';
import type { UsageMeter } from '../../usage/meter';

export const TRAIL_LEAD = 'trail lead';

export type AgentTracker = TrackerAdapter & { dispose?(): void };

export interface AgentOptions {
  /** Tracker folder (absolute). */
  root: string;
  /** Fixed trail name, e.g. `claude-07`. Default: picked from the client name. */
  agent?: string;
  /** Connected client, e.g. `claude-code 2.1.0`; read lazily because MCP only knows it after initialize. */
  client?: () => string | undefined;
  /** Poll interval for answers written by the Lookout. */
  pollMs?: number;
  /** Tracker the trails live in (the project's active tracker). Default: local markdown in `root`. */
  tracker?: AgentTracker;
  /** Reads real usage from the agent's local logs; without one (or until it finds a log) the agent's reported numbers count. */
  usage?: Pick<UsageMeter, 'noteCall' | 'measure'> & Partial<Pick<UsageMeter, 'model'>>;
  /** How often usage of the running session is re-read. */
  usagePollMs?: number;
  /** Lease length of a claim; renewed by every tool call. Default: $TEAMTRAIL_LEASE_MINUTES, else 15 min. */
  leaseMs?: number;
  /**
   * Set when the agent connects over HTTP with a token: it may be on another machine, so nothing may assume it
   * shares this filesystem (no worktree is prepared, no check or git evidence is taken as its work).
   */
  remote?: {
    tokenName: string;
    /** The token's id: what tells this agent from another, whatever trail names it takes. */ tokenId?: string;
  };
}

export interface TicketPlanInput {
  ref: string;
  title: string;
  type: TicketType;
  body?: string;
  hitl?: boolean;
  blockedBy?: string[];
  criteria?: { text: string; kind: CriterionKind; source?: string }[];
  guide?: string;
}

export interface AskResult {
  answered: boolean;
  questionId: string;
  answer?: string;
  answeredBy?: string;
  waitedSeconds: number;
}

export interface WaitControl {
  signal?: AbortSignal;
  /** Called about every 15 s while waiting, so clients that reset timeouts on progress keep the call open. */
  onProgress?: (waitedSeconds: number) => void;
}

/** What close_ticket and report_completion take. */
export interface CloseInput {
  ticket?: string;
  trail?: string;
  resolution: string;
  /** The answered question this close is the human's decision by; default the latest one asked on the ticket. */
  questionId?: string;
  summary?: string;
  rationale?: string;
  alternatives?: string[];
  outcome?: 'completed' | 'out_of_scope';
  postTranscript?: boolean;
  /** Why no files changed is fine for this ticket (verified completions only). */
  noCodeReason?: string;
  /** The pull request with this work (report_completion), recorded on the attempt for PR sync. */
  pr?: number;
  /** How long to wait for checks when the completion needs verification. */
  waitSeconds?: number;
  /** Evidence per acceptance criterion. */
  criteria?: CriterionEvidence[];
  /** Answers to the ticket guide's checklist. */
  checklist?: ChecklistAnswer[];
  /** What the call touches and the files it changes, for the risk policy. */
  category?: RiskCategory;
  paths?: string[];
  /** Trail assumptions (`S-<n>`) the decision relies on. */
  assumes?: string[];
}
