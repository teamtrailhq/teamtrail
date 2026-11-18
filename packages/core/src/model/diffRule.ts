import type { AnswerVia } from './answerVia';
import type { ActorKind } from './lifecycle';

/**
 * A diff rule in verification.json's `rules`: when a change touches files its `when` globs match, it runs an approved
 * check (`check`), asks the agent a question it must answer in its completion (`ask`), or both. `why` is the incident
 * behind it, shown with it everywhere, so a rule never reads as an arbitrary hoop.
 */
export interface DiffRule {
  /** `R-<n>`, unique in the file. */
  id: string;
  /** Repo-relative path globs; a plain path matches itself and anything under it. */
  when: string[];
  /** A check named in `checks`, run on the completion besides the usual ones. */
  check?: string;
  /** A question the agent answers in its completion: "Does a new field load from older transcripts that lack it?" */
  ask?: string;
  /** Why the rule exists: "D-12: old sessions failed to load after #34". */
  why: string;
}

/** An agent's answer to an `ask` rule, given with its completion (`ruleAnswers`). */
export interface RuleAnswer {
  rule: string;
  answer: string;
}

/**
 * A rule a completion's changed files matched, as its attempt keeps it: the files that triggered it, and for an `ask`
 * rule the agent's answer (its word, shown as claimed), the trail lead's waiver, or neither (`unanswered`).
 */
export interface AttemptRule {
  id: string;
  why: string;
  files: string[];
  check?: string;
  ask?: string;
  answer?: string;
  waived?: { by: string; reason: string; at: number };
  unanswered?: true;
}

/**
 * The trail lead's "Go without R-1" for one ticket: the rule's question needn't be answered on its completions. Kept
 * in the machine store (verification/ruleWaivers.ts), where an agent in the repo can't write one.
 */
export interface RuleWaiver {
  v: 1;
  mapId: string;
  ticketId: string;
  ticketKey: string;
  rule: string;
  reason: string;
  by: string;
  via: AnswerVia;
  at: number;
}

/** A rule waived for a ticket, or that waiver undone, in the trail's journal. */
export interface RuleWaiverEntry {
  v: 1;
  kind: 'rule-waiver';
  at: number;
  mapId: string;
  ticketId: string;
  ticketKey: string;
  rule: string;
  /** `undone`: the trail lead's Undo, so the rule asks again; absent (journals before 0.61.1) or `waived`: Go without. */
  action?: 'waived' | 'undone';
  /** Why it went without; for an undo, the reason it had. */
  reason: string;
  actor: string;
  actorKind: ActorKind;
}

/** A completion refused because rules it matched went unanswered: what the agent was told, for the Lookout. */
export interface HeldRules {
  v: 1;
  at: number;
  agent: string;
  rules: { id: string; ask: string; why: string; files: string[] }[];
}
