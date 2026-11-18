import type { ActorKind } from './lifecycle';
import type { MainCheckResult, MainRunResult } from './mainChecks';

/*
 * Trail verified together (trailChecks/): once every ticket of a trail is done and merged, the approved checks run
 * again on the default branch at a commit that contains all of their work. Each ticket passing alone is not enough:
 * five branches together can still break.
 */

/**
 * How one done ticket's work reached the default branch:
 * - `merged`: its pull request merged (or, without one, its verified commit); `commit` must be in the run's commit.
 * - `open`: its pull request is still open. `closed`: closed without merging.
 * - `unknown`: work was expected but no commit or pull request was recorded.
 * - `nothing`: nothing to merge (a research or junction ticket, or no file changed).
 */
export type MergeState = 'merged' | 'open' | 'closed' | 'unknown' | 'nothing';

export interface TicketMerge {
  ticketId: string;
  key: string;
  state: MergeState;
  pr?: number;
  /** The commit the default branch must contain: the pull request's merge commit, else the verified commit. */
  commit?: string;
  /** Whether the commit checked (the run's, or the default branch's head now) contains it. */
  contained?: boolean;
}

/** One run of the approved checks on the default branch for a trail. */
export interface TrailRun {
  v: 1;
  id: string;
  mapId: string;
  /** The commit the checks ran on; null when none could be found. */
  commit: string | null;
  branch: string | null;
  startedAt: number;
  finishedAt?: number;
  /** The approved verification.json the checks came from. */
  configHash: string;
  checks: MainCheckResult[];
  result: MainRunResult;
  /** Why it is `unavailable`, or what else to know. */
  note?: string;
  /** The embedding server's runner that ran it, when one did. */
  runner?: string;
  /** `trail lead` (Run now, Run again) or Teamtrail when the last merge landed. */
  by: string;
  /** Each done ticket's work as it stood for this run. */
  merges: TicketMerge[];
  /** Every done ticket was done and its work was in the commit the checks ran on. */
  complete: boolean;
  /** The config and the done tickets' commits it ran for: a run with the same key is not started again by itself. */
  key: string;
  /** The process running it, while `running`. */
  pid?: number;
}

/** Where the combined run stands for one trail. */
export type TrailChecksState =
  | { kind: 'off'; reason: string }
  | { kind: 'waiting'; reason: string }
  | { kind: 'due' }
  | { kind: 'running' }
  | { kind: 'passed' }
  | { kind: 'failed'; failing: string[] }
  | { kind: 'unavailable'; reason: string };

/** What `trailDone` needs: whether the trail was verified together, and why not when it wasn't. */
export type TrailTogether =
  | { kind: 'passed'; commit: string; branch: string | null; runId: string }
  | { kind: 'failed'; reason: string; runId: string }
  | { kind: 'pending'; reason: string };

/** What the Lookout, agents and an embedding server read for one trail. */
export interface TrailChecksView {
  mapId: string;
  state: TrailChecksState;
  together: TrailTogether;
  /** The latest run for this trail, a Run now before everything merged included. */
  run?: TrailRun;
  /** Each done ticket's work, as it stands now. */
  merges: TicketMerge[];
}

/** A combined run asked for or finished, or a fix ticket added, in the trail's journal. */
export interface TrailChecksEntry {
  v: 1;
  kind: 'trail-checks';
  at: number;
  mapId: string;
  action: 'run' | 'result' | 'fix-ticket';
  runId?: string;
  result?: MainRunResult;
  commit?: string | null;
  /** The fix ticket added. */
  ticketId?: string;
  actor: string;
  actorKind: ActorKind;
  reason?: string;
}
