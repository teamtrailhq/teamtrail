import { repoRootOf } from '@teamtrail/core/agents';
import type { AgentContext } from './agentContext';

/** Where a trail's combined run on the default branch is read from: this checkout, or the embedding server's runner. */
export function trailEnv(ctx: AgentContext) {
  const runner = ctx.opts.checkRunner;
  return { root: ctx.root, repoRoot: repoRootOf(ctx.verifyEnv()), ...(runner ? { checkRunner: runner } : {}) };
}
