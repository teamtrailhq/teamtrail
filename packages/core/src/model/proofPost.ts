import type { ActorKind } from './lifecycle';

/** The trail lead switching on or off posting proofs to pull requests from this machine (Settings → Verification). */
export interface ProofPostEntry {
  v: 1;
  kind: 'proof-post';
  at: number;
  mapId: string;
  action: 'on' | 'off';
  actor: string;
  actorKind: ActorKind;
  reason?: string;
}

/** The journal "trail" that holds the proof-posting switch. */
export const PROOF_POST_JOURNAL = '_proof';

/** The GitHub commit status Teamtrail sets on a pull request's head, under the `Teamtrail proof` context. */
export interface ProofStatusCall {
  state: 'success' | 'failure';
  /** At most 140 characters, as GitHub allows. */
  description: string;
}

/** What this machine last posted for one ticket (`.evidence/<map>/<ticket>/proof-post.json`), so it posts once. */
export interface ProofPostRecord {
  v: 1;
  mapId: string;
  ticketId: string;
  pr: number;
  headSha: string;
  digest: string;
  state: ProofStatusCall['state'];
  commentUrl?: string;
  postedAt?: number;
  /** The last try failed with this (redacted); it is tried again on the next pass. */
  error?: string;
  triedAt: number;
}

/** Posts a ticket's proof to a pull request: one comment, found again by its marker, and one commit status. */
export interface ProofPublisher {
  readonly repo: string;
  upsertComment(pr: number, body: string): Promise<{ url: string }>;
  setStatus(sha: string, status: ProofStatusCall & { targetUrl?: string; context?: string }): Promise<void>;
}
