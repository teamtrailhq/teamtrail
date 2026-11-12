import type { Unreachable } from './offlineReply';

/** What Scout says when it can't reach the person's Teamtrail, in the place they acted. */
export const UNREACHABLE_TEXT: Record<Unreachable, string> = {
  'not-linked':
    "Scout works with Teamtrail running on your computer, and isn't connected to yours yet. Start Teamtrail in your project with `npx teamtrail@next`, then in the Lookout open Settings → Slack and choose Add Scout to Slack.",
  offline: "Your Teamtrail isn't running. Start it (`npx teamtrail@next` in your project) and try again.",
  stale: 'This Scout message is no longer connected to a Teamtrail, so nothing was done.',
};
