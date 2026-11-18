import type { Release } from './releases';

/** Releases 0.44–0.51, kept apart so `releases.ts` stays short (0.27–0.43 in `midReleases.ts`). Newest first. */
export const LATER_RELEASES: Release[] = [
  {
    version: '0.51.0',
    date: '2026-11-16',
    items: [
      'Review limit: set how much finished work may wait for your review, and agents start no new work past it',
      'Agents finish rework and keep researching meanwhile, and Waiting on you shows what to review first',
      'Set it in Settings → Attention; in Teamtrail Cloud, workspace owners set it there too',
    ],
  },
  {
    version: '0.50.0',
    date: '2026-11-16',
    items: [
      'On the map, a done ticket’s check is green when its work is verified, grey when it isn’t',
      'Cards say “checks running” while a completion is checked, and a Legend explains the dots',
    ],
  },
  {
    version: '0.49.0',
    date: '2026-11-16',
    items: [
      'In Teamtrail Cloud, Start the trail right after New trail, or from the trail’s header: agents start in place',
      'A trail started in the Lookout gets your project’s default verification level, as one an agent starts does',
    ],
  },
  {
    version: '0.48.1',
    date: '2026-11-16',
    items: ['Scout’s Get started sits in the bottom-right corner; adding your own check shows examples'],
  },
  {
    version: '0.48.0',
    date: '2026-11-16',
    items: ['In Teamtrail Cloud, Scout keeps Get started in the corner until your workspace is set up'],
  },
  {
    version: '0.47.0',
    date: '2026-11-16',
    items: ['Set the checks every finished ticket must pass in Settings → Verification, no file to edit'],
  },
  {
    version: '0.46.0',
    date: '2026-11-16',
    items: [
      'In Teamtrail Cloud, Approve and merge on a verified ticket merges its pull request at the commit that was checked',
    ],
  },
  {
    version: '0.45.0',
    date: '2026-11-16',
    items: ['In Teamtrail Cloud, Run agents on the trail takes you straight to its agents'],
  },
  {
    version: '0.44.2',
    date: '2026-11-16',
    items: ['The middle of the Lookout gets the same margin at the top as at its sides'],
  },
  {
    version: '0.44.1',
    date: '2026-11-16',
    items: ['Text you type in forms is full size (14px) again, not the small caps of the label above it'],
  },
  {
    version: '0.44.0',
    date: '2026-11-16',
    items: ['In a hosted Lookout, the theme toggle and Settings → Appearance change your theme on the server too'],
  },
];
