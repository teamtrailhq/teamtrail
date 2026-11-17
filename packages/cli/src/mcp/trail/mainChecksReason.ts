import { mainChecksItem, type MainChecksView } from '@teamtrail/core';

const NOT_A_QUESTION =
  "Don't ask_human about it: an answer to a question can't change this, only the trail lead's choice in the Lookout can.";

/**
 * Why checks on main hold an agent's work, said to the agent: the core reason, and, when main fails, that only the
 * trail lead can choose how the trail goes on, in the Lookout's queue item, which the agent tells the human about
 * instead of asking them. An agent that asked got an answer ("drop lint") that changed nothing.
 */
export function mainChecksReason(view: MainChecksView): { reason?: string; lookoutItem?: string } {
  const { state, run, reason } = view;
  if (!reason || state.kind !== 'failed' || !run) return { reason };
  if (state.fixing) {
    return {
      reason: `${reason} The trail lead re-runs checks on main in the Lookout once it's fixed. ${NOT_A_QUESTION}`,
    };
  }
  const item = mainChecksItem({ mapId: view.mapId, runId: run.id, failing: state.failing });
  const where = `the "${item.named}" item in their queue (${item.link} on the Lookout's address)`;
  const choose = `Only the trail lead can choose (fix main first, drop the check for this trail or start anyway), in the Lookout: ${where}. Tell the human that.`;
  return { reason: `${reason} ${choose} ${NOT_A_QUESTION}`, lookoutItem: item.link };
}
