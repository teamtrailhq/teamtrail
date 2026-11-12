import { journalFile, needsLookout, operatorAction } from '@teamtrail/core/agents';
import { postResponse } from '../api';
import { LOOKOUT_ONLY, label, mention, type ApprovalRef } from '../blocks';
import { closeTicket, waitingApproval } from './approvals';
import type { SlackContext } from './slackContext';

/** Approve or send back to rework from Slack, as the trail lead would in the Lookout. */
export async function decideApproval(
  ctx: SlackContext,
  by: { ref: ApprovalRef; user: string; responseUrl?: string },
  d: { action: 'approve' } | { action: 'rework'; reason: string },
) {
  const { ref, user, responseUrl } = by;
  const item = await waitingApproval(ctx, ref, d.action, responseUrl);
  if (!item) return;
  // A completion that touched high-risk files is approved in the Lookout only; sending it back is always allowed.
  if (d.action === 'approve' && needsLookout.approval(ctx.o.root, item)) {
    await postResponse(
      responseUrl,
      { response_type: 'ephemeral', replace_original: false, text: LOOKOUT_ONLY },
      ctx.o.fetch,
    );
    return;
  }
  const env = { adapter: await ctx.o.active(), root: ctx.o.root, journal: journalFile(ctx.o.root) };
  try {
    await operatorAction(env, {
      action: d.action,
      mapId: ref.m,
      ticketId: ref.t,
      by: `slack:${user}`,
      ...(d.action === 'rework' ? { reason: d.reason } : {}),
    });
  } catch (e) {
    if (responseUrl)
      await postResponse(
        responseUrl,
        {
          response_type: 'ephemeral',
          replace_original: false,
          text: `Could not ${d.action}: ${label((e as Error).message)}`,
        },
        ctx.o.fetch,
      );
    return;
  }
  const line =
    d.action === 'approve'
      ? `✓ Approved by ${mention(user)} via Slack.`
      : `↺ Sent back to rework by ${mention(user)} via Slack.`;
  await closeTicket(ctx, ref.m, ref.t, line);
}
