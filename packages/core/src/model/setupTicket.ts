import type { ActorKind } from './lifecycle';

/**
 * A new repo has no project to check yet, so its checks can't exist before its first code does. Its trail's first
 * ticket sets the project up (Ticket.setup): readiness's checks findings don't hold it, its agent proposes the
 * checks in verification.json, and it completes only once the trail lead approved them, so it is checked like any
 * other ticket. Every other implementation ticket waits for approved checks.
 */
export const NEW_REPO_FINDING = 'repo-new';

/** A ticket marked as its trail's setup ticket, in the trail's journal. */
export interface SetupTicketEntry {
  v: 1;
  kind: 'setup-ticket';
  at: number;
  mapId: string;
  ticketId: string;
  actor: string;
  actorKind: ActorKind;
  reason?: string;
}

/** Checks a setup ticket's agent proposed (`propose_checks`): written to verification.json, waiting for approval. */
export interface ChecksProposedEntry {
  v: 1;
  kind: 'checks-proposed';
  at: number;
  mapId: string;
  ticketId: string;
  actor: string;
  actorKind: ActorKind;
  /** The proposed checks' names, in order. */
  checks: string[];
  reason?: string;
}
