import type { ProofStatus } from './proof';
import type { TrailTogether } from './trailChecks';
import type { Ticket } from './types';

/**
 * Whether a trail reached its destination (planning/trailDone.ts), with the reason in words.
 * - `not-done`: a ticket is still open (waiting for review included), a reroute is pending, nothing was done, or
 *   only discovery was (research, junction and review tickets) while the plan isn't charted yet.
 * - `verified`: every ticket in scope is done, each one's proof is verified, and the approved checks passed on the
 *   default branch at a commit holding all of their merges (`together`).
 * - `unverified`: every ticket in scope is done, but some were closed without a verified proof (`unverified`, ids), or
 *   the trail wasn't verified together yet, or that run failed (`together`).
 */
export type TrailDone =
  | { kind: 'not-done'; reason: string }
  | { kind: 'verified'; done: number; together: Extract<TrailTogether, { kind: 'passed' }>; reason: string }
  | { kind: 'unverified'; done: number; unverified: string[]; together: TrailTogether; reason: string };

export interface TrailDoneInput {
  /** `type` tells discovery tickets from the plan's; a ticket without one counts as the plan's. */
  tickets: (Pick<Ticket, 'id' | 'state' | 'closeReason'> & Partial<Pick<Ticket, 'type'>>)[];
  /** Each done ticket's proof status (`GET /proof/trail`); a done ticket with none counts as not verified. */
  proofs: Record<string, ProofStatus>;
  /** Reroute proposals still waiting on the trail lead. */
  pendingReroutes: number;
  /** The combined run on the default branch (`GET /trail-checks`, trailChecks/). */
  together: TrailTogether;
  /**
   * The trail lead skipped discovery for this trail on this machine (discovery/discoveryGate.ts `discoverySkipped`).
   * Unless they did, a trail whose tickets in scope are all discovery tickets isn't charted yet, so it isn't done.
   * Leaving it out counts as not skipped.
   */
  discoverySkipped?: boolean;
}
