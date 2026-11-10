import path from 'node:path';
import { trustedWorkspace } from '../workspaces/trustedWorkspace';
import { readWorkspace } from '../workspaces/workspaceStore';

/** Where checks and git evidence of one ticket run, or why they can't run anywhere. */
export type Checkout = { kind: 'here'; path: string } | { kind: 'none'; reason: string };

/**
 * The checkout a ticket's completion is graded in: the worktree Teamtrail prepared for it on this machine, or the
 * repo when the ticket has no workspace. A workspace record Teamtrail didn't prepare here (an agent wrote it, or it
 * came from another machine), or one whose folder is gone, grades nothing: running the checks in the main checkout
 * instead would judge other code.
 */
export function checkoutFor(env: { root: string; repoRoot?: string }, mapId: string, ticketId: string): Checkout {
  const repo = env.repoRoot ?? path.dirname(env.root);
  if (env.repoRoot) return { kind: 'here', path: repo };
  const record = readWorkspace(env.root, mapId, ticketId);
  if (!record) return { kind: 'here', path: repo };
  const ws = trustedWorkspace(env.root, mapId, ticketId);
  if (ws) return { kind: 'here', path: ws.path };
  return {
    kind: 'none',
    reason: `the ticket's worktree (${record.path}) was not prepared on this machine, or is gone; claim the ticket again for a new one`,
  };
}
