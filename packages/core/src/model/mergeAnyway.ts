import type { AnswerVia } from './answerVia';
import type { ActorKind } from './lifecycle';

/**
 * The trail lead's "Merge anyway": a done ticket whose proof isn't verified may have its pull request merged, at the
 * commit the proof covers (or, when it names none, the pull request's head the page showed), with the gaps the
 * Lookout showed accepted. Kept in the machine store
 * (proof/mergeAcceptances.ts), where an agent in the repo can't write one, and as their decision. A server that merges
 * pull requests (the Lookout's `managed.merge`) asks for one before it merges an unverified ticket.
 */
export interface MergeAcceptance {
  v: 1;
  id: string;
  mapId: string;
  ticketId: string;
  ticketKey: string;
  /**
   * The only head a merge may take: the commit the proof covers, or, with `atPrHead`, the pull request's head as the
   * page showed it (PR sync's snapshot), since the proof names no commit.
   */
  head: string;
  /** The proof names no commit (a ticket finished with no checks set): `head` is the pull request's, as it was shown. */
  atPrHead?: true;
  /** With `atPrHead`, the pull request it was. */
  pr?: number;
  /** The proof's gaps as the page showed them. */
  gaps: string[];
  /** `sha256:` of the head and the gaps (proof/gapsHash.ts): what a server that merges compares. */
  gapsHash: string;
  /** The person, when the sign-in named them; else `trail lead`. */
  by: string;
  via: AnswerVia;
  at: number;
  /** The decision record it was kept as. */
  decisionId?: string;
}

/** A Merge anyway, in the trail's journal. */
export interface MergeAnywayEntry {
  v: 1;
  kind: 'merge-anyway';
  at: number;
  mapId: string;
  ticketId: string;
  ticketKey: string;
  acceptance: string;
  head: string;
  /** Accepted at the pull request's head, since the proof names no commit. */
  atPrHead?: true;
  gaps: string[];
  actor: string;
  actorKind: ActorKind;
  reason?: string;
}

/** Why Merge anyway at the pull request's head is refused once it moved: what the person sees, from any server. */
export const PR_HEAD_MOVED = 'The pull request has new commits since you looked. Review again.';
