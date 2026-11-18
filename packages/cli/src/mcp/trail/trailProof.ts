import { repoRootOf } from '@teamtrail/core/agents';
import { signedTrailProofMarkdown, trailProofFor } from '@teamtrail/core/node';
import type { AgentContext } from './agentContext';

/**
 * `proof_report` with `wholeTrail`: the trail's proof, each done ticket's proof and the approved checks run on the
 * default branch with all of their merges together, as signed Markdown with its status, gaps and digest. Read-only:
 * it never starts a run.
 */
export async function trailProofReport(ctx: AgentContext, input: { trail?: string }) {
  const running = ctx.sessions.running()?.info;
  const snap = await ctx.resolveTrail(input.trail ?? (running?.mapId || undefined));
  const runner = ctx.opts.checkRunner;
  const env = { root: ctx.root, repoRoot: repoRootOf(ctx.verifyEnv()), ...(runner ? { checkRunner: runner } : {}) };
  const proof = await trailProofFor({ env, snap, decisions: await ctx.decisions(snap.map.id) });
  const signed = signedTrailProofMarkdown(ctx.root, proof);
  return {
    trail: snap.map.title,
    status: proof.status,
    gaps: proof.gaps,
    digest: proof.digest,
    together: proof.together ? { result: proof.together.result, commit: proof.together.commit } : null,
    markdown: signed.markdown,
    signed: !!signed.signature,
    howTo:
      proof.status === 'verified'
        ? 'The trail is verified together. Put `markdown` where the trail is reported, as it is.'
        : "Not verified yet: `gaps` says why. Teamtrail runs the checks on main by itself once every ticket is merged; a failure there is the trail lead's to act on in the Lookout.",
  };
}
