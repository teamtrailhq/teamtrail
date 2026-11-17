import type { Release } from './releases';

/** Releases 0.44–0.45, kept apart so `releases.ts` stays short (0.27–0.43 in `midReleases.ts`). Newest first. */
export const LATER_RELEASES: Release[] = [
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
