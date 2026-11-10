import type { TicketType } from './types';

/*
 * A reroute proposal: typed changes to a trail's map, proposed by an agent with evidence, applied only when the
 * trail lead approves. Tickets are named by id; tickets the proposal adds are named by their `ref`, which later changes
 * in the same proposal may use (`blockedBy`, `ticket`).
 *
 * `edit_ticket` rewrites a ticket's title and body, `rewire` adds and removes blockers, and `reopen` puts a done or
 * cancelled ticket back in the queue, all through the tracker itself.
 */
export type RerouteChange =
  | {
      op: 'add_ticket';
      ref: string;
      title: string;
      type: TicketType;
      body?: string;
      hitl?: boolean;
      blockedBy?: string[];
    }
  | { op: 'cancel_ticket'; ticket: string; reason: string }
  | { op: 'edit_ticket'; ticket: string; title?: string; body?: string }
  | { op: 'rewire'; ticket: string; addBlockedBy?: string[]; removeBlockedBy?: string[] }
  | { op: 'supersede_decision'; decision: string; answer: string; rationale: string }
  | { op: 'update_destination'; text: string }
  | { op: 'add_unspecified'; text: string }
  | { op: 'add_out_of_scope'; text: string }
  | { op: 'reopen'; ticket: string; reason: string };

export type RerouteOp = RerouteChange['op'];

export const REROUTE_OPS: RerouteOp[] = [
  'add_ticket',
  'cancel_ticket',
  'edit_ticket',
  'rewire',
  'supersede_decision',
  'update_destination',
  'add_unspecified',
  'add_out_of_scope',
  'reopen',
];

/**
 * `reroute`: the plan changes to reach the same destination.
 * `challenge-destination`: the destination itself is wrong; carries a `reason` and a suggested new destination.
 */
export type RerouteKind = 'reroute' | 'challenge-destination';

/** Why the destination is challenged: the work exists already, the trail targets the wrong problem, or it should be rescoped. */
export type DestinationReason = 'already-exists' | 'wrong-problem' | 'rescope';

export const DESTINATION_REASONS: DestinationReason[] = ['already-exists', 'wrong-problem', 'rescope'];

export type RerouteStatus = 'pending' | 'approved' | 'rejected' | 'superseded';

export interface RerouteProposal {
  v: 1;
  /** `R-<n>`, per trail. */
  id: string;
  mapId: string;
  kind: RerouteKind;
  /** challenge-destination only. */
  destinationReason?: DestinationReason;
  /** Actor id (agent trail name) and session that proposed it. */
  by: string;
  sessionId?: string;
  /** Who was behind the agent: `token:<id>` for a remote agent, `local:<id>` for a connection on this machine. */
  origin?: string;
  /**
   * Set when the proposal touches so much of the trail's open work that freezing it would stop the trail: then
   * it freezes nothing, and the trail lead is told instead.
   */
  wide?: { touched: number; open: number };
  /** `rule-out`: an agent asking to rule a ticket out (close_ticket out_of_scope), kept apart from plan proposals. */
  lane?: 'rule-out';
  at: number;
  reason: string;
  evidence: string;
  /** Assumption ids (`S-<n>`) the evidence invalidates. */
  invalidates: string[];
  changes: RerouteChange[];
  status: RerouteStatus;
  decidedBy?: string;
  decidedAt?: number;
  /** The trail lead's note: required to reject, optional to approve. */
  note?: string;
  /** Superseded by a newer proposal of the same agent. */
  supersededBy?: string;
  /** Indexes of the changes already executed, so an interrupted apply resumes where it stopped. */
  applied: number[];
  /** Ticket ids created by `add_ticket` / `reopen` changes, by change index (resume uses them, never re-creates). */
  created: Record<number, string>;
}

/** One validation problem; `change` is the index of the offending change, absent for proposal-level problems. */
export interface RerouteError {
  change?: number;
  message: string;
}

/** How a ticket comes out of the proposal in the dry run. */
export type DiffMark = 'added' | 'cancelled' | 'revised' | 'rewired' | 'reopened' | 'unchanged';

export interface DiffNode {
  /** Ticket id, or `ref` for tickets the proposal adds. */
  id: string;
  key?: string;
  title: string;
  type: TicketType;
  mark: DiffMark;
  /** Blockers after the change; for added tickets, ids or refs. */
  blockedBy: string[];
  /** Edges this proposal adds, as blocker ids or refs. */
  newEdges: string[];
  /** Edges this proposal removes, as blocker ids (not in `blockedBy`). */
  removedEdges?: string[];
}

/** The dry-run result: every ticket before and after, plus the trail-level lines that change. */
export interface RerouteDiff {
  nodes: DiffNode[];
  destination?: { before: string; after: string };
  unspecified: string[];
  outOfScope: string[];
  superseded: { decision: string; answer: string }[];
}
