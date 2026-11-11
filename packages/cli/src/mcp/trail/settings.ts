import { OperationError, settingText, type RerouteChange } from '@teamtrail/core';
import type { AgentContext } from './agentContext';
import { proposeRerouteOp } from './reroutes';

/*
 * The trail lead's settings an agent may ask about: skipping discovery (start_trail discovery=false), the trail's
 * mode and its destination (update_trail). The call never changes them: it becomes a request in the trail's
 * `setting` lane (a reroute proposal), which the trail lead approves or declines in the Lookout or Slack, like a
 * rule-out. An answer to a question can't stand in for it: whatever the words, only Approve changes the setting,
 * and the approval is kept as their decision.
 */
export async function requestSetting(ctx: AgentContext, r: { trail: string; change: RerouteChange; why: string }) {
  const what = settingText(r.change);
  const proposal = await proposeRerouteOp(ctx, {
    trail: r.trail,
    lane: 'setting',
    reason: `${what[0].toUpperCase()}${what.slice(1)}`,
    evidence: r.why,
    changes: [r.change],
  });
  if (!('id' in proposal))
    throw new OperationError(
      `Can't ask to ${what}: ${JSON.stringify((proposal as { errors?: unknown }).errors ?? proposal)}`,
    );
  return {
    request: proposal.id,
    status: 'waiting-on-the-human',
    note: `To ${what} is the trail lead's call: it is request ${proposal.id}, which they approve or decline in the Lookout or Slack. Nothing changes until they approve. Carry on as the trail is; reroute_status (id ${proposal.id}, wait: true) tells you their decision.`,
  };
}
