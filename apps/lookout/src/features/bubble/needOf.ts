import type { AttentionItem, AttentionKind } from '@teamtrail/core';

/** What the top of a ticket's bubble asks of the human. */
export type BubbleNeed =
  | { kind: 'question'; questionId: string }
  | { kind: 'item'; label: string; title: string; urgent: boolean; item: AttentionItem }
  | { kind: 'none' };

/** The label over what the queue holds on the ticket. */
const LABEL: Partial<Record<AttentionKind, string>> = {
  merge: 'Ready to merge',
  approval: 'Approve it',
  blocked: 'Blocked',
  stalled: 'Went quiet',
  'hitl-ready': 'Yours to decide',
  policy: 'Check a risky change',
  overlap: 'Two agents, same files',
  integration: 'Branches clash',
  model: 'Waits for a model',
  precedent: 'Touches your decision',
  flag: 'PR or CI',
  'tracker-settings': 'Settings changed',
  'review-limit': 'Review waits',
  escape: 'Verified, then came back',
  criteria: 'Confirm its criteria',
};

/** The item's title without the ticket key the bubble already shows ("#21: PR #412 ready to merge" → "PR #412 …"). */
const withoutKey = (title: string) => title.split('\n')[0].replace(/^[^\s:]+: /, '');

/**
 * What the bubble leads with: the agent's open question on the ticket, else the queue's most urgent item on it, else
 * nothing (the bubble is the ticket alone). `urgent` items get the red label.
 */
export function needOf(input: {
  questionId?: string;
  items: AttentionItem[];
  urgentOf: (item: AttentionItem) => boolean;
}): BubbleNeed {
  if (input.questionId) return { kind: 'question', questionId: input.questionId };
  const item = input.items.find((i) => i.kind !== 'question');
  if (!item) return { kind: 'none' };
  const label = LABEL[item.kind] ?? 'Needs you';
  return { kind: 'item', label, title: withoutKey(item.title), urgent: input.urgentOf(item), item };
}
