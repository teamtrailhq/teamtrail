import type { AnswerVia } from './answerVia';
import type { ActorKind } from './lifecycle';

/**
 * The trail lead's "Merge anyway": a done ticket whose proof isn't verified may have its pull request merged, at the
 * commit the proof covers, with the gaps the Lookout showed accepted. Kept in the machine store
 * (proof/mergeAcceptances.ts), where an agent in the repo can't write one, and as their decision. A server that merges
 * pull requests (the Lookout's `managed.merge`) asks for one before it merges an unverified ticket.
 */
export interface MergeAcceptance {
  v: 1;
  id: string;
  mapId: string;
  ticketId: string;
  ticketKey: string;
  /** The commit the proof covers: the only head a merge may take. */
  head: string;
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
  gaps: string[];
  actor: string;
  actorKind: ActorKind;
  reason?: string;
}
