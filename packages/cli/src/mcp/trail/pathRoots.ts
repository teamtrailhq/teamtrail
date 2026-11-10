import { readLeases, repoRootFor, repoRootSpellings } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';

/**
 * Where an absolute path an agent declares may point and still be a repo path: the repo, and the worktrees prepared
 * for this connection's own claims (an agent there sends paths in its worktree). Each in every spelling (symlinks).
 */
export function pathRoots(ctx: AgentContext): string[] {
  const own = readLeases(ctx.root).flatMap((l) =>
    !l.returned && l.origin === ctx.origin && l.workspace ? [l.workspace.path] : [],
  );
  return [repoRootFor(ctx.root), ...own].flatMap(repoRootSpellings);
}
