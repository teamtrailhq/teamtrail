import type { AttentionSource, Candidate } from '../types';

/** Refusals in a row before it is worth the human's attention; one can be a passing hiccup. */
const REPEATED = 3;

const NAMES: Record<string, string> = { slack: 'Slack' };

/**
 * A connector whose messages keep being refused (an archived channel, the bot removed): nothing it would have sent
 * gets through until the human fixes it. Low priority; everything still waits in the Lookout.
 */
export const deliverySource: AttentionSource = {
  kind: 'delivery',
  collect({ deliveries }) {
    return (deliveries ?? [])
      .filter((p) => p.failures >= REPEATED)
      .map((p): Candidate => ({
        kind: 'delivery',
        mapId: '',
        title: `${NAMES[p.channel] ?? p.channel} messages aren't getting through`,
        since: p.since,
        urgency: 'fyi',
        ref: p.channel,
        holds: [],
        notes: [p.message, `${p.failures} refused in a row`],
      }));
  },
};
