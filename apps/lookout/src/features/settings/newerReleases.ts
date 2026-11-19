import type { Release } from './releases';

/** Releases 0.61–0.63, kept apart so `releases.ts` stays short (0.45–0.60 in `laterReleases.ts`). Newest first. */
export const NEWER_RELEASES: Release[] = [
  {
    version: '0.63.1',
    date: '2026-11-18',
    items: ['At night, trail cards stand out from the map: a raised grey card, its chips in darker wells'],
  },
  {
    version: '0.63.0',
    date: '2026-11-18',
    items: [
      'Tickets read as their agents wrote them: lists, bold, code and links, in the bubble and the full ticket',
      'Every ticket has the same shape: its title and chips (state, agent and model, verified, risk), then What, Acceptance criteria, How, Progress, Proof and History, and its actions at the end',
      'Merge anyway shows only on done work with something to merge, never on a research ticket',
      'A ticket that needs you says so in red, says what is asked, and its first button does it; in the dark theme, the ticket and menus sit on a lighter sheet over the map',
    ],
  },
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
