import type { CriterionKind, TicketType, TrackerAdapter } from '@teamtrail/core';
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
}

export interface TicketPlanInput {
  ref: string;
  title: string;
  type: TicketType;
  body?: string;
  hitl?: boolean;
  blockedBy?: string[];
  criteria?: { text: string; kind: CriterionKind; source?: string }[];
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
