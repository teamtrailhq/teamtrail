import { pairsLabel, repoPaths, touchOverlaps, type MapSnapshot, type Ticket, type Workspace } from '@teamtrail/core';
import {
  prepareWorktree,
  readIntegrationScan,
  readLease,
  readLeases,
  readWorkspace,
  readWorkspaceSettings,
  repoRootOf,
  repoRootSpellings,
  writeLease,
} from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';
import { pathRoots } from './pathRoots';

export interface ClaimParallel {
  workspace?: Workspace;
  workspaceNote?: string;
  warnings: { kind: 'overlap'; ticket: string; agent: string; paths: [string, string][]; message: string }[];
}

/** Worktrees are folders on the machine Teamtrail runs on; an agent elsewhere can't edit files in one. */
const REMOTE_WORKSPACE_NOTE =
  "No worktree: you're connected remotely, and Teamtrail prepares worktrees only on the machine it runs on. Work on a branch of your own in your checkout, push it, and name the branch (and pull request) when you complete.";

/** The globs a claim touches, repo-relative like every declared path (absolute or escaping ones are refused). */
const clean = (globs: string[] | undefined, repoRoot: string[]) =>
  repoPaths(
    (globs ?? []).filter((g) => g.trim()),
    repoRoot,
  );

/**
 * The parallel-work part of a claim: the ticket's worktree (when the project or the agent asks for one), the files
 * the agent says it will change, kept on its lease, and warnings for other live claims that touch the same files.
 */
export async function claimParallel(
  ctx: AgentContext,
  at: { mapId: string; ticket: Ticket; agent: string; touches?: string[]; workspace?: boolean },
): Promise<ClaimParallel> {
  const { settings } = readWorkspaceSettings(ctx.root);
  const wanted = at.workspace ?? settings.worktrees;
  const prepared =
    wanted && !ctx.remote
      ? await prepareWorktree({
          root: ctx.root,
          repoRoot: repoRootOf(ctx.verifyEnv()),
          settings,
          mapId: at.mapId,
          ticket: at.ticket,
          agent: at.agent,
        })
      : undefined;
  const workspace = prepared && 'workspace' in prepared ? prepared.workspace : undefined;
  const touches = clean(at.touches, [...pathRoots(ctx), ...(workspace ? repoRootSpellings(workspace.path) : [])]);
  const lease = readLease(ctx.root, at.mapId, at.ticket.id);
  if (lease && (touches.length || workspace)) writeLease(ctx.root, { ...lease, touches, workspace });
  const overlaps = touches.length
    ? touchOverlaps({ mapId: at.mapId, ticketId: at.ticket.id, touches }, readLeases(ctx.root))
    : [];
  return {
    ...(workspace ? { workspace } : {}),
    ...(prepared && 'note' in prepared ? { workspaceNote: prepared.note } : {}),
    ...(wanted && ctx.remote ? { workspaceNote: REMOTE_WORKSPACE_NOTE } : {}),
    warnings: overlaps.map((o) => ({
      kind: 'overlap',
      ticket: o.ticketKey,
      agent: o.agent,
      paths: o.pairs,
      message: `${o.agent} on ${o.ticketKey} may change the same files (${pairsLabel(o.pairs)}). Keep to your files, or ask the human which goes first.`,
    })),
  };
}

/** A completion result with the ticket's review branch added, when it had a worktree. */
export async function withReview<R extends object>(
  c: { ctx: AgentContext; snap: MapSnapshot; ticket: Ticket; agent: string },
  result: R,
) {
  return { ...result, ...(await branchForReview(c.ctx, c.snap.map.id, c.ticket, c.agent)) };
}

/**
 * `{ workspace }` with the branch to review, on a completion of a ticket that had a worktree (else `{}`); also
 * posted once as a ticket comment. Teamtrail never merges it.
 */
export async function branchForReview(ctx: AgentContext, mapId: string, t: Ticket, agent: string) {
  const ws = readWorkspace(ctx.root, mapId, t.id);
  if (!ws) return {};
  const line = `Work for review on branch \`${ws.branch}\` (worktree ${ws.path}). Teamtrail never merges it.`;
  const fresh = (await ctx.load(mapId)).tickets.find((x) => x.id === t.id);
  if (!fresh?.comments.some((c) => c.body.includes(`\`${ws.branch}\``)))
    await ctx.adapter.comment(mapId, t.id, agent, line);
  return { workspace: { branch: ws.branch, path: ws.path, base: ws.base, review: line } };
}

/** `status`: active worktrees and overlaps on the trail, when there are any. */
export function parallelView(ctx: AgentContext, snap: MapSnapshot) {
  const leases = readLeases(ctx.root).filter((l) => !l.returned && l.mapId === snap.map.id);
  const workspaces = leases.flatMap((l) =>
    l.workspace ? [{ ticket: l.ticketKey, agent: l.agent, branch: l.workspace.branch }] : [],
  );
  const declared = leases.flatMap((l) =>
    touchOverlaps({ mapId: l.mapId, ticketId: l.ticketId, touches: l.touches ?? [] }, leases)
      .filter((o) => o.ticketId.localeCompare(l.ticketId, undefined, { numeric: true }) > 0)
      .map((o) => `${l.ticketKey} and ${o.ticketKey}: ${pairsLabel(o.pairs)}`),
  );
  const changed = readIntegrationScan(ctx.root)
    .overlaps.filter((o) => o.mapId === snap.map.id)
    .map((o) => `${o.tickets[0].ticketKey} and ${o.tickets[1].ticketKey} changed ${o.files.join(', ')}`);
  if (!workspaces.length && !declared.length && !changed.length) return undefined;
  return { workspaces, declared, changed };
}
