import type { Release } from './releases';

/** Releases 0.1–0.6, kept apart so `olderReleases.ts` stays short. Newest first. */
export const EARLIEST_RELEASES: Release[] = [
  {
    version: '0.6.0',
    date: '2026-10-31',
    items: [
      'Named MILOOPS; MILO speaks for the platform in the activity log and onboarding',
      'Tracker sync status, last-write latency and event pulse',
      'Inbox: oldest question age and average wait',
      'Critical path, decided per hour with burndown, type mix',
      'Per-session tokens and cost, mission totals, claims per agent',
    ],
  },
  {
    version: '0.5.0',
    date: '2026-10-31',
    items: [
      'Status counters and resolution bar on the map',
      'Current step tracker with step pipeline',
      'Sessions with live timers',
      'Activity log with time and source columns',
      'Out-of-scope quarantine zone on the map',
    ],
  },
  {
    version: '0.4.0',
    date: '2026-10-31',
    items: [
      'Missions: switcher with progress and waiting count, New mission in the switcher',
      'Inbox collects questions from every mission',
      'Elapsed time and progress per mission',
      'Responsive layout with progressive disclosure (wide, laptop, phone)',
      'Map graph pans and zooms by drag, pinch and wheel',
      'Changelog',
    ],
  },
  {
    version: '0.3.0',
    date: '2026-10-31',
    items: ['Fixed-zone layout', 'Plan + execute and plan-only mission modes', 'Execute tickets'],
  },
  {
    version: '0.2.0',
    date: '2026-10-31',
    items: [
      'Local markdown tracker (default)',
      'Onboarding',
      'HITL transcript: summary or full',
      'Settings with tracker connectors',
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-31',
    items: [
      'Live map graph',
      'HITL vs AFK tickets',
      'In-window HITL conversations',
      'Demo tracker with simulated sessions',
    ],
  },
];
