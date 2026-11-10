import { existsSync } from 'node:fs';
import type { GitEvidence, GitTreeState } from '../model/evidence';
import type { MapSnapshot, Ticket } from '../model/types';
import type { VerificationConfig } from '../model/verification';
import { DEFAULT_CONFIG } from '../verification/config';
import { latestBaseline } from './baseline';
import { changesSince, statsOf } from './changes';
import { evidenceFlags } from './flags';
import { git } from './git';
import { otherWork } from './otherWork';
import { findWorktree, readTreeState } from './treeState';

export interface EvidenceRequest {
  /** Tracker folder. */
  root: string;
  /** Where the agent works, used when the claim left no baseline. */
  cwd: string;
  snap: MapSnapshot;
  ticket: Ticket;
  config?: VerificationConfig;
  /** `configHash` of verification.json now; absent when there is no file. */
  configHash?: string;
  noCodeReason?: string;
}

/**
 * The git evidence of a completion: the worktree now, the files changed since
 * the claim's baseline, and the flags a human should see. Read in the
 * baseline's worktree, so it does not matter where the completing process runs.
 */
export async function collectEvidence(r: EvidenceRequest): Promise<GitEvidence> {
  const base = latestBaseline(r.root, r.snap.map.id, r.ticket.id);
  const b = base?.git ?? undefined;
  const dir = b && existsSync(b.toplevel) ? b.toplevel : r.cwd;
  const found = await findWorktree(dir, r.root);
  const wt = 'error' in found ? undefined : found;
  const now = wt && (await readTreeState(wt));
  const changed = wt && now && b ? await changesSince(wt, now, b) : [];
  const flags = evidenceFlags({
    base,
    now,
    ...('error' in found ? { noGit: found.error } : {}),
    changed,
    ticketType: r.ticket.type,
    noChanges: (r.config ?? DEFAULT_CONFIG).noChanges,
    noCodeReason: r.noCodeReason,
    configHash: r.configHash,
    descends: await descendsFrom(b, now),
    others: now ? await otherWork(r.root, r.snap, r.ticket) : [],
  });
  return {
    v: 1,
    ...(base ? { baseline: base.id } : {}),
    ...(b ? { base: { head: b.head, branch: b.branch } } : {}),
    ...(now ? { tree: treeOf(now) } : {}),
    changed,
    stats: statsOf(changed),
    ...(r.configHash ? { configHash: r.configHash } : {}),
    flags,
  };
}

/** Whether the worktree's head still descends from the baseline's; `undefined` when either side is unknown. */
async function descendsFrom(b: GitTreeState | undefined, now: GitTreeState | undefined): Promise<boolean | undefined> {
  if (!now || !b) return undefined;
  if (!b.head || !now.head || b.head === now.head) return true;
  return (await git(now.toplevel, ['merge-base', '--is-ancestor', '--end-of-options', b.head, now.head])).code === 0;
}

const treeOf = (now: GitTreeState) => ({
  toplevel: now.toplevel,
  head: now.head,
  branch: now.branch,
  fingerprint: now.fingerprint,
});
