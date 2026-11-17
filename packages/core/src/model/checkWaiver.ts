import type { AnswerVia } from './answerVia';
import type { ActorKind } from './lifecycle';

/** One check the trail lead let a ticket complete without, with the command it ran then. */
export interface WaiverCheck {
  name: string;
  argv: string[];
}

/**
 * The trail lead's "Accept without <check>": the named checks don't run for this ticket's completions while it holds,
 * as long as each still runs the command it ran when they waived it. Kept in the machine store
 * (verification/checkWaivers.ts), where an agent in the repo can't write one. Undone by its Undo, or when the ticket
 * is reopened after it.
 */
export interface CheckWaiver {
  v: 1;
  id: string;
  mapId: string;
  ticketId: string;
  ticketKey: string;
  /** The completion whose failing checks the trail lead saw. */
  attemptId: string;
  checks: WaiverCheck[];
  reason: string;
  /** The person, when the sign-in named them; else `trail lead`. */
  by: string;
  via: AnswerVia;
  at: number;
  /** The decision record it was kept as. */
  decisionId?: string;
  undone?: { by: string; at: number };
}

/** A check an attempt didn't run because the trail lead waived it, as the attempt and its proof keep it. */
export interface WaivedCheck {
  name: string;
  argv: string[];
  by: string;
  reason: string;
  at: number;
  waiver: string;
}

/** A failing check of a ticket's latest completion the trail lead may accept the ticket without. */
export interface WaivableCheck {
  name: string;
  argv: string[];
  /** `sha256:` of what the page shows: the attempt, the name and the command (verification/waivableChecks.ts). */
  hash: string;
}

/** A waiver given or undone, in the trail's journal. */
export interface WaiverEntry {
  v: 1;
  kind: 'waiver';
  at: number;
  mapId: string;
  ticketId: string;
  ticketKey: string;
  action: 'waived' | 'undone';
  waiver: string;
  /** The checks' names. */
  checks: string[];
  actor: string;
  actorKind: ActorKind;
  reason?: string;
}
