import type { MainRunResult } from './mainChecks';
import type { ProofCheck, ProofStatus } from './proof';
import type { MergeState } from './trailChecks';

/** One ticket of the trail as its own proof stands: its digest names the ticket proof it summarises. */
export interface TrailProofTicket {
  id: string;
  key: string;
  title: string;
  status: ProofStatus;
  gaps: string[];
  digest: string;
}

/** The combined run on the default branch the trail proof relies on. */
export interface TrailProofRun {
  id: string;
  commit: string | null;
  branch: string | null;
  result: MainRunResult;
  /** Every ticket was done and its work was in the commit the checks ran on. */
  complete: boolean;
  by: string;
  finishedAt?: number;
  /** The embedding server's runner, when one ran it. */
  runner?: string;
  checks: ProofCheck[];
  merges: { key: string; state: MergeState; pr?: number; commit?: string; contained?: boolean }[];
}

/**
 * Verified by Teamtrail for a whole trail: each ticket's proof and the combined run on the default branch, built only
 * from what this machine recorded. `digest` covers everything else; it is signed like a ticket's proof.
 */
export interface TrailProof {
  v: 1;
  kind: 'trail';
  trail: { id: string; title: string };
  status: ProofStatus;
  /** Why it isn't verified, one line each; empty when it is. */
  gaps: string[];
  tickets: TrailProofTicket[];
  /** The latest combined run for the trail; missing when none ran. */
  together?: TrailProofRun;
  /** `sha256:` of the canonical JSON of every other field. */
  digest: string;
}
