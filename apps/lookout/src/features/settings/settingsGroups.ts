import type { SettingsGroup } from './types';

/** The Settings page's side nav: every section, grouped by whose setting it is. */
export const SETTINGS_GROUPS: SettingsGroup[] = [
  {
    id: 'trail',
    blurb: 'How agents work on this trail and what proves work done',
    label: 'This trail',
    intro:
      'How agents work on the trail on screen: its mode, the checks that prove work done, the gates, diff rules, models and guides.',
    sections: [
      { id: 'mode', title: 'Trail mode', decides: 'Whether agents build, or only plan' },
      { id: 'verification', title: 'Verification', decides: 'What done must pass' },
      { id: 'gates', title: 'Gates', decides: 'How each gate acts' },
      { id: 'rules', title: 'Diff rules', decides: 'What a change to certain files must also pass' },
      { id: 'models', title: 'Model matching', decides: 'Which models take which tickets' },
      { id: 'trail-guides', title: 'Guides by type', decides: 'Which guides each ticket type gets' },
    ],
  },
  {
    id: 'project',
    blurb: 'Where this repo keeps its trails, and its rules',
    label: 'Project',
    intro: 'Where this repo keeps its trails, and the rules every agent working in it follows.',
    sections: [
      { id: 'approvals', title: 'Approvals', decides: 'What this machine trusts from the repo' },
      { id: 'readiness', title: 'Repo readiness', decides: 'Whether checks can run in this repo' },
      { id: 'tracker', title: 'Tracker', decides: 'Where trails and tickets are kept' },
      { id: 'workspaces', title: 'Workspaces', decides: 'Whether each claim gets its own worktree' },
      { id: 'check-variables', title: 'Check variables', decides: 'Which variables checks may read' },
      { id: 'proof', title: 'Proof on pull requests', decides: 'Whether proofs go on pull requests' },
      { id: 'remote-agents', title: 'Remote agents', decides: 'Which agents may connect over the network' },
      { id: 'policy', title: 'Risk policy', decides: 'What always needs you' },
      { id: 'guides', title: 'Guides', decides: 'Which guides agents can follow' },
      { id: 'labels', title: 'Labels', decides: 'The labels Teamtrail puts on issues' },
    ],
  },
  {
    id: 'alerts',
    blurb: 'What interrupts you and where questions reach you',
    label: 'Attention & alerts',
    intro: 'What interrupts you, where questions reach you, and what Scout tells you when you come back.',
    sections: [
      { id: 'attention', title: 'Attention', decides: 'What interrupts you, and when' },
      { id: 'slack', title: 'Slack', decides: 'Questions and approvals in Slack' },
      { id: 'trip-report', title: 'Trip report', decides: 'What Scout tells you when you come back' },
    ],
  },
  {
    id: 'you',
    blurb: 'How the Lookout looks and reads for you',
    label: 'You',
    intro: 'How the Lookout looks and reads for you, and the browsers and devices signed in to it.',
    sections: [
      { id: 'hands', title: 'Hands-off or Hands-on', decides: 'What the Lookout opens on' },
      { id: 'appearance', title: 'Appearance', decides: 'How the Lookout looks' },
      { id: 'transcript', title: 'HITL transcript', decides: 'How a decision keeps its conversation' },
      { id: 'agent', title: 'Agent', decides: 'The coding agent you work with' },
      { id: 'devices', title: 'Browsers & devices', decides: 'Who is signed in to this Lookout' },
    ],
  },
  {
    id: 'projects',
    blurb: 'Every repo this Lookout knows',
    label: 'All projects',
    intro: 'Every repo this Lookout knows, so you can switch between them from the header.',
    sections: [{ id: 'projects', title: 'Projects', decides: 'Which repos this Lookout supervises' }],
  },
];
