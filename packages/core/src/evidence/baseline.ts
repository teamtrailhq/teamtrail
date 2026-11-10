import { readdirSync } from 'node:fs';
import path from 'node:path';
import { readJsonFile } from '../lib/jsonFile';
import type { GitBaseline } from '../model/evidence';
import type { Ticket } from '../model/types';
import { trustedChecks } from '../verification/checksApproval';
import { evidencePaths, writeOnce } from '../verification/evidenceStore';
import { findWorktree, readTreeState } from './treeState';

/*
 * The worktree at claim, next to the ticket's attempts:
 *   <tracker dir>/.evidence/<mapId>/<ticketId>/baseline-<n>.json   GitBaseline, written once
 */
const RE = /^baseline-(\d+)\.json$/;

function numbers(root: string, mapId: string, ticketId: string) {
  try {
    return readdirSync(path.join(root, evidencePaths.ticket(mapId, ticketId)))
      .map((n) => Number(n.match(RE)?.[1]))
      .filter((n) => n > 0)
      .sort((a, b) => a - b);
  } catch {
    return [];
  }
}

const file = (mapId: string, ticketId: string, id: string) => `${evidencePaths.ticket(mapId, ticketId)}/${id}.json`;

export const readBaseline = (root: string, mapId: string, ticketId: string, id: string) => {
  const b = readJsonFile<GitBaseline>(path.join(root, file(mapId, ticketId, id)));
  return b?.v === 1 ? b : undefined;
};

/** The ticket's most recent baseline: the one its next completion is measured from. */
export function latestBaseline(root: string, mapId: string, ticketId: string) {
  const n = numbers(root, mapId, ticketId).at(-1);
  return n ? readBaseline(root, mapId, ticketId, `baseline-${n}`) : undefined;
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

/** Records HEAD, branch, the dirty files and the verification.json hash as a claim finds them. Never throws. */
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
  for (;;) {
    const id = `baseline-${(numbers(c.root, c.mapId, c.ticket.id).at(-1) ?? 0) + 1}`;
    try {
      writeOnce(c.root, file(c.mapId, c.ticket.id, id), { ...rec, id });
      return { ...rec, id };
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code === 'EEXIST') continue;
      return { ...rec, id, note: `baseline not saved: ${(e as Error).message}` };
    }
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
