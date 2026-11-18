import type { Escape } from './escape';
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
  /** The guides of its latest attempt; missing on attempts from before guides came by type. */
  guides?: string[];
  /** Verified, then came back: reopened or reverted (model/escape.ts). */
  escaped?: boolean;
  /** The checks that passed on its verified attempt (the one that came back, when it did). */
  passedChecks?: string[];
}

/** A session's model and spend, as its session record has them. */
export interface ScorecardSession {
  id: string;
  model?: string;
  costUsd?: number;
}

/** One group of tickets: a ticket type and model, a model, an agent, a vendor or a guide. */
export interface ScorecardRow {
  key: string;
  type?: string;
  model?: string;
  guide?: string;
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
  /** Tickets verified, then reopened or reverted. */
  escaped: number;
  /** escaped / tickets ever verified, 0–1; missing with none verified. */
  escapeRate?: number;
  /** At least `minSample` tickets: only these are compared or suggested. */
  enough: boolean;
}

/** One check: the verified tickets it passed on, and how many of those came back anyway. */
export interface EscapeCheckRow {
  key: string;
  verified: number;
  escaped: number;
  /** escaped / verified, 0–1. */
  escapeRate: number;
  /** At least `minSample` verified tickets. */
  enough: boolean;
}

export interface Scorecard {
  minSample: number;
  tickets: number;
  byTypeAndModel: ScorecardRow[];
  byModel: ScorecardRow[];
  byAgent: ScorecardRow[];
  byVendor: ScorecardRow[];
  /** One row per guide the work was done under; a ticket with several guides counts in each. */
  byGuide: ScorecardRow[];
  /** One row per ticket type. Missing from older servers. */
  byType?: ScorecardRow[];
  /** Per check that passed on verified work: what it let through. Missing from older servers. */
  byCheck?: EscapeCheckRow[];
  /** Verified work that came back, newest first. Missing from older servers. */
  escapes?: Escape[];
}
