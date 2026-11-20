import type { SettingsGroup } from './types';

/** The Settings page's side nav: every section, grouped by whose setting it is. */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: 'trail',
    label: 'This trail',
    intro:
      'How agents work on the trail on screen: its mode, the checks that prove work done, the gates, diff rules, models and guides.',
    sections: [
      { id: 'mode', title: 'Trail mode' },
      { id: 'verification', title: 'Verification' },
      { id: 'gates', title: 'Gates' },
      { id: 'rules', title: 'Diff rules' },
      { id: 'models', title: 'Model matching' },
      { id: 'trail-guides', title: 'Guides by type' },
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
      { id: 'check-variables', title: 'Check variables' },
      { id: 'proof', title: 'Proof on pull requests' },
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
      { id: 'hands', title: 'Hands-off or Hands-on' },
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
];
