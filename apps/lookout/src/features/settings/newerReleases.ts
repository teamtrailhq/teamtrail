import type { Release } from './releases';

/** Releases 0.61–0.62, kept apart so `releases.ts` stays short (0.45–0.60 in `laterReleases.ts`). Newest first. */
export const NEWER_RELEASES: Release[] = [
  {
    version: '0.62.0',
    date: '2026-11-18',
    items: [
      'Map, Plan, Activity and Logbook sit in a bar of their own under the header',
      'The map runs a chain of tickets in a straight line, from main to the destination, with a review beside the ticket it reviews',
      'Legend has a background, like Fit',
    ],
  },
  {
    version: '0.61.2',
    date: '2026-11-18',
    items: [
      'Went without a diff rule by mistake? Undo it in the ticket, and the rule asks again on the next completion',
      "Where a ticket's work started is kept on your machine, not in the repo, so an agent can't move it to slip a change past the check guard",
      'In Teamtrail Cloud, a trail is checked on exactly the commit Teamtrail names on main',
    ],
  },
  {
    version: '0.61.1',
    date: '2026-11-18',
    items: [
      'A trail with many tickets side by side lays them out in a grid, in order of number, instead of one tall column',
    ],
  },
  {
    version: '0.61.0',
    date: '2026-11-18',
    items: [
      "A pass counts only when the work didn't change what the check runs, skip or delete tests, or pass only on a retry",
      'A trail is verified only when your checks pass again on main with every ticket merged',
      'Reviews go first to an agent on another model, and rules you write ask agents about the files they touch',
      'Settings → This trail → Gates: try each gate in Observe first; the scorecard shows verified work that came back',
    ],
  },
];
