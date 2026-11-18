import type { ProofStatus } from './proof';
import type { TrailTogether } from './trailChecks';
import type { Ticket } from './types';

/**
 * Whether a trail reached its destination (planning/trailDone.ts), with the reason in words.
 * - `not-done`: a ticket is still open (waiting for review included), a reroute is pending, or nothing was done.
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
  tickets: Pick<Ticket, 'id' | 'state' | 'closeReason'>[];
  /** Each done ticket's proof status (`GET /proof/trail`); a done ticket with none counts as not verified. */
  proofs: Record<string, ProofStatus>;
  /** Reroute proposals still waiting on the trail lead. */
  pendingReroutes: number;
  /** The combined run on the default branch (`GET /trail-checks`, trailChecks/). */
  together: TrailTogether;
}
