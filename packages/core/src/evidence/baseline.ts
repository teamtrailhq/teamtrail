import type { GitBaseline } from '../model/evidence';
import type { Ticket } from '../model/types';
import { trustedChecks } from '../verification/checksApproval';
import { baselineStore } from './baselineStore';
import { findWorktree, readTreeState } from './treeState';

/** The ticket's most recent baseline this machine recorded and signed (baselineStore.ts): its next completion's base. */
export function latestBaseline(root: string, mapId: string, ticketId: string) {
  return baselineStore.latest(root, mapId, ticketId);
}

export interface ClaimInfo {
  /** Tracker folder. */
  root: string;
  /** Where the agent works; the repo is the git worktree holding it. */
  cwd: string;
  mapId: string;
  ticket: Pick<Ticket, 'id' | 'key'>;
  agent: string;
  sessionId?: string;
}

/**
 * Records HEAD, branch, the dirty files and the verification.json hash as a claim finds them, in this machine's store
 * (baselineStore.ts), never the repo. Never throws.
 */
export async function captureBaseline(c: ClaimInfo): Promise<GitBaseline> {
  const wt = await findWorktree(c.cwd, c.root);
  // the approved config, as completions use it, so "changed during the ticket" compares like with like
  const { config } = trustedChecks(c.root);
  const rec = {
    v: 1 as const,
    mapId: c.mapId,
    ticketId: c.ticket.id,
    ticketKey: c.ticket.key,
    agent: c.agent,
    ...(c.sessionId ? { sessionId: c.sessionId } : {}),
    at: Date.now(),
    ...('error' in wt ? { git: null, note: wt.error } : { git: await readTreeState(wt) }),
    ...(config.hash ? { configHash: config.hash } : {}),
  };
  try {
    return baselineStore.add(c.root, rec);
  } catch (e) {
    // a config folder this process can't write: no baseline, and the completion's guard holds what it can't compare
    return { ...rec, id: 'baseline-unsaved', note: `baseline not saved: ${(e as Error).message}` };
  }
}

/**
 * The baseline a claim works from. Resuming one's own claim, or taking back a
 * ticket sent for rework in the same worktree, keeps the existing baseline so
 * the next completion counts every change made for the ticket; any other
 * claim starts a new one.
 */
export async function baselineForClaim(c: ClaimInfo & { resume: boolean }): Promise<GitBaseline> {
  const last = c.resume ? latestBaseline(c.root, c.mapId, c.ticket.id) : undefined;
  if (last) {
    const wt = await findWorktree(c.cwd, c.root);
    const here = 'error' in wt ? null : wt.toplevel;
    if ((last.git?.toplevel ?? null) === here) return last;
  }
  return captureBaseline(c);
}
