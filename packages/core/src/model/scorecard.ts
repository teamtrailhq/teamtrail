import type { AttemptResult } from './verification';

/** One ticket's completion record, as the scorecard reads it. */
export interface ScorecardTicket {
  mapId: string;
  ticketId: string;
  type: string;
  /** Closed as completed with a passing last attempt. */
  verified: boolean;
  /** Oldest first. */
  attempts: { agent: string; sessionId?: string; result: AttemptResult }[];
  /** Review findings on the ticket's work, by severity. */
  findings: { info: number; warn: number; error: number };
  /** First claim to done, when both are known. */
  leadMs?: number;
}

/** A session's model and spend, as its session record has them. */
export interface ScorecardSession {
  id: string;
  model?: string;
  costUsd?: number;
}

/** One group of tickets: a ticket type and model, a model, an agent or a vendor. */
export interface ScorecardRow {
  key: string;
  type?: string;
  model?: string;
  /** Tickets with at least one completion, credited to whoever made the first. */
  tickets: number;
  verified: number;
  verifiedFirstTime: number;
  /** verifiedFirstTime / tickets, 0–1. */
  firstTimeRate: number;
  /** Tickets that needed more than one attempt, 0–1. */
  reworkRate: number;
  /** Attempts per verified ticket. */
  attemptsPerVerified?: number;
  costUsd: number;
  costPerVerifiedUsd?: number;
  medianLeadMs?: number;
  findings: { info: number; warn: number; error: number };
  /** At least `minSample` tickets: only these are compared or suggested. */
  enough: boolean;
}

export interface Scorecard {
  minSample: number;
  tickets: number;
  byTypeAndModel: ScorecardRow[];
  byModel: ScorecardRow[];
  byAgent: ScorecardRow[];
  byVendor: ScorecardRow[];
}
