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
  model: 'Model',
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
  model: 'tickets waiting for a model',
};

/** Snooze choices, in minutes. */
export const SNOOZE_OPTIONS = [
  { minutes: 30, label: '30 min' },
  { minutes: 120, label: '2 hours' },
  { minutes: 60 * 24, label: 'Tomorrow' },
];
