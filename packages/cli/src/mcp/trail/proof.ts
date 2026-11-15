import { OperationError } from '@teamtrail/core';
import { proofForTicket, proofMarkdown } from '@teamtrail/core/node';
import type { AgentContext } from './agentContext';

/**
 * `proof_report`: what Teamtrail recorded about a ticket's completion (default: the agent's current ticket), as
 * Markdown for the pull request and with its status, gaps and digest. Read-only.
 */
export async function proofReport(ctx: AgentContext, input: { trail?: string; ticket?: string }) {
  const running = ctx.sessions.running()?.info;
  const snap = await ctx.resolveTrail(input.trail ?? (running?.mapId || undefined));
  const ref = input.ticket ?? running?.ticketId;
  if (!ref) throw new OperationError('Which ticket? Pass `ticket`.');
  const t = ctx.findTicket(snap, ref);
  const proof = proofForTicket({ root: ctx.root, snap, ticket: t, decisions: await ctx.decisions(snap.map.id) });
  return {
    ticket: t.key,
    status: proof.status,
    gaps: proof.gaps,
    digest: proof.digest,
    markdown: proofMarkdown(proof),
    howTo:
      proof.status === 'verified'
        ? 'Put `markdown` in the pull request description as it is. Never edit it: the digest covers it.'
        : 'Not verified yet: `gaps` says why. Put `markdown` in the pull request anyway, as it is, so reviewers see what is missing.',
  };
}
