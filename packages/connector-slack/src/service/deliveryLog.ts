import { BRAND, type DeliveryProblem } from '@teamtrail/core';
import { readDeliveryProblems, writeDeliveryProblem } from '@teamtrail/core/bridge';

const CHANNEL = 'slack';
const SCOUT = `@${BRAND.assistant.name}`;

/** What a Slack error code means for the trail lead, and what to do about it. */
const MEANING: Record<string, string> = {
  is_archived: `The channel ${SCOUT} posts to was archived. Pick another channel in Settings → Slack.`,
  channel_not_found: `${SCOUT} can't find the channel it posts to. Pick another channel in Settings → Slack.`,
  not_in_channel: `${SCOUT} isn't in the channel it posts to. Invite ${SCOUT} there, or pick another channel.`,
  user_not_found: `${SCOUT} can't reach the owner in Slack. Reset the owner and set it again.`,
  cannot_dm_bot: `${SCOUT} can't message the owner. Reset the owner and set it again.`,
};

/**
 * Messages Slack refused for good, for Settings → Slack and the attention queue (core `delivery/deliveryStore.ts`,
 * in the tracker folder so the queue sees it). One message that gets through clears it.
 */
export function deliveryLog(root: string, now: () => number) {
  let problem = readDeliveryProblems(root).find((p) => p.channel === CHANNEL);
  const save = (p: DeliveryProblem | undefined) => {
    problem = p;
    try {
      writeDeliveryProblem(root, CHANNEL, p);
    } catch {
      /* the record is for the Lookout; a folder that can't be written doesn't stop delivery */
    }
  };
  return {
    get: () => problem,
    delivered() {
      if (problem) save(undefined);
    },
    refused(code: string) {
      const at = now();
      save({
        channel: CHANNEL,
        code,
        message: MEANING[code] ?? `Slack refused a message (${code}).`,
        since: problem?.since ?? at,
        at,
        failures: (problem?.failures ?? 0) + 1,
      });
    },
  };
}
