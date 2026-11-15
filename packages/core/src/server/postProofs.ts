import type { ProofPostRecord } from '../model/proofPost';
import { proofPostSetting } from '../proof/proofPostSetting';
import { publishProofs } from '../proof/publishProofs';
import type { ProofAccess } from './githubProofAccess';
import type { RouteContext } from './routeContext';

/**
 * One pass of posting proofs, run by the reconciler after it read the PRs: nothing unless the trail lead switched
 * posting on for this machine and a GitHub repo and token are there.
 */
export function postProofs(ctx: RouteContext, deps: { access: ProofAccess; configDir?: string }) {
  return async (): Promise<ProofPostRecord[]> => {
    if (!proofPostSetting(ctx.root, deps.configDir).enabled()) return [];
    const publisher = await deps.access();
    if (typeof publisher === 'string') return [];
    return publishProofs({ root: ctx.root, adapter: await ctx.active(), publisher, configDir: deps.configDir });
  };
}
