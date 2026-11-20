import type { Release } from './releases';

/** Releases 0.66.13–0.66.16, kept apart so `releases.ts` stays short (0.61–0.66.12 in `newerReleases.ts`). Newest first. */
export const RECENT_RELEASES: Release[] = [
  {
    version: '0.66.16',
    date: '2026-11-19',
    items: [
      'Hands-off on a phone: every kind of Needs you fits the screen, with actions big enough to tap, and each row acts on what it asks',
      'Teamtrail Cloud: Pause shows Stopping… until the agents have stopped, and Start shows Starting… until one is working',
    ],
  },
  {
    version: '0.66.15',
    date: '2026-11-19',
    items: [
      'Two answers to the same question at once (the Lookout and Slack, or two people): the first is the one used everywhere, and the other is kept in the conversation as "also answered, not used"',
    ],
  },
  {
    version: '0.66.14',
    date: '2026-11-19',
    items: ['Running the tests no longer leaves folders behind in the temp folder'],
  },
  {
    version: '0.66.13',
    date: '2026-11-19',
    items: ["Checking a proof finds the repo's proof keys when the repo is reached through a symbolic link"],
  },
];
