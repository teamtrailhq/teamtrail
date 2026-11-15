import type { RiskCategory } from './risk';

/** What a question or a change is about, for finding the decisions already made on it. */
export interface PrecedentQuery {
  /** The question as it will be asked; wording only ever suggests, it never answers. */
  text: string;
  /** The ticket it is asked on. */
  ticketId?: string;
  /** The risk categories it is about. */
  categories?: RiskCategory[];
  /** Repo-relative files or globs it touches. */
  paths?: string[];
  /** Assumption ids (`S-<n>`) it relies on. */
  assumes?: string[];
  /** Decision ids the agent says it relates to. */
  relatesTo?: string[];
}

/**
 * An earlier decision that may already answer a question. `strong`: the same ticket or area and the same risk
 * category, or named by the agent; it is returned instead of asking. `suggested`: only shown, never answers.
 */
export interface Precedent {
  id: string;
  mapId: string;
  ticketKey?: string;
  question: string;
  summary: string;
  answer: string;
  decidedBy: string;
  decidedAt: number;
  strength: 'strong' | 'suggested';
  /** Why it matches, one line each. */
  reasons: string[];
  /** Another project's decision (All projects), by that project's name. */
  project?: string;
}
