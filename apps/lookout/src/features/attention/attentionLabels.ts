import type { AttentionKind } from '@teamtrail/core';

/** The short tag on a queue row; questions show the asking agent instead. */
export const KIND_LABEL: Record<AttentionKind, string> = {
  question: 'Question',
  approval: 'Approve',
  blocked: 'Blocked',
  flag: 'PR / CI',
  stalled: 'Stalled',
  'hitl-ready': 'Needs you',
  knowledge: 'Field guide',
  brief: 'Brief',
  policy: 'Risk',
  reroute: 'Reroute',
  'reroute-suggested': 'Reroute?',
  overlap: 'Overlap',
  integration: 'Integrate',
  guide: 'Guide',
  'guide-checks': 'Approve',
  trust: 'Approve',
  model: 'Model',
  delivery: 'Delivery',
  'tracker-settings': 'Settings',
  precedent: 'Precedent',
  'review-limit': 'Review',
  'main-checks': 'Main',
  'trail-checks': 'Together',
  merge: 'Merge',
};

/** What a batch of one kind is called: "3 questions from Reminders, answer together". */
export const KIND_PLURAL: Record<AttentionKind, string> = {
  question: 'questions',
  approval: 'approvals',
  blocked: 'blocked tickets',
  flag: 'PR / CI flags',
  stalled: 'stalled claims',
  'hitl-ready': 'tickets for you',
  knowledge: 'field guide entries',
  brief: 'briefs',
  policy: 'risky changes',
  reroute: 'reroutes',
  'reroute-suggested': 'suggested reroutes',
  overlap: 'overlapping claims',
  integration: 'clashing branches',
  guide: 'guides to approve',
  'guide-checks': 'guide checks to approve',
  trust: 'things to approve on this machine',
  model: 'tickets waiting for a model',
  delivery: 'connectors not delivering',
  'tracker-settings': 'settings changed in the tracker',
  precedent: 'changes to what you decided',
  'review-limit': 'review queues full',
  'main-checks': 'checks failing on main',
  'trail-checks': 'trails failing on main together',
  merge: 'pull requests ready to merge',
};

/** Snooze choices, in minutes. */
export const SNOOZE_OPTIONS = [
  { minutes: 30, label: '30 min' },
  { minutes: 120, label: '2 hours' },
  { minutes: 60 * 24, label: 'Tomorrow' },
];
