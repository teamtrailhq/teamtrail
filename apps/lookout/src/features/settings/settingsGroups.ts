import type { SettingsGroup } from './types';

/** The Settings page's side nav: every section, grouped by whose setting it is. */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: 'trail',
    label: 'This trail',
    intro: 'How agents work on the trail on screen: its mode, the checks that prove work done, models and guides.',
    sections: [
      { id: 'mode', title: 'Trail mode' },
      { id: 'verification', title: 'Verification' },
      { id: 'models', title: 'Model matching' },
      { id: 'team', title: 'Team' },
    ],
  },
  {
    id: 'project',
    label: 'Project',
    intro: 'Where this repo keeps its trails, and the rules every agent working in it follows.',
    sections: [
      { id: 'approvals', title: 'Approvals' },
      { id: 'tracker', title: 'Tracker' },
      { id: 'workspaces', title: 'Workspaces' },
      { id: 'remote-agents', title: 'Remote agents' },
      { id: 'policy', title: 'Risk policy' },
      { id: 'guides', title: 'Guides' },
      { id: 'labels', title: 'Labels' },
    ],
  },
  {
    id: 'alerts',
    label: 'Attention & alerts',
    intro: 'What interrupts you, where questions reach you, and what Scout tells you when you come back.',
    sections: [
      { id: 'attention', title: 'Attention' },
      { id: 'slack', title: 'Slack' },
      { id: 'trip-report', title: 'Trip report' },
    ],
  },
  {
    id: 'you',
    label: 'You',
    intro: 'How the Lookout looks and reads for you, and the browsers and devices signed in to it.',
    sections: [
      { id: 'appearance', title: 'Appearance' },
      { id: 'transcript', title: 'HITL transcript' },
      { id: 'agent', title: 'Agent' },
      { id: 'devices', title: 'Browsers & devices' },
    ],
  },
  {
    id: 'projects',
    label: 'All projects',
    intro: 'Every repo this Lookout knows, so you can switch between them from the header.',
    sections: [{ id: 'projects', title: 'Projects' }],
  },
  {
    id: 'about',
    label: 'About',
    intro: 'What Teamtrail is, and what changed in each release.',
    sections: [{ id: 'changelog', title: 'Changelog' }],
  },
];
