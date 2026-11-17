import type { AttentionItem, AttentionKind } from '@teamtrail/core';
import { KIND_LABEL } from './attentionLabels';

/** What a map card says when the queue holds something on it, in two or three words. */
const CARD_TEXT: Partial<Record<AttentionKind, string>> = {
  question: 'waiting on you',
  approval: 'approve it',
  merge: 'ready to merge',
  blocked: 'blocked',
  stalled: 'went quiet',
  'hitl-ready': 'yours to decide',
  model: 'needs a model',
  policy: 'risky change',
  flag: 'PR or CI',
  overlap: 'same files',
  integration: 'branches clash',
  precedent: 'your decision',
  'tracker-settings': 'settings changed',
  'review-limit': 'review waits',
};

/** What a chip says the human does, after the key: "#6 Decide", "#12 Approve". */
const CHIP_VERB: Partial<Record<AttentionKind, string>> = {
  'hitl-ready': 'Decide',
  approval: 'Approve',
  blocked: 'Unblock',
  stalled: 'Went quiet',
  model: 'Needs a model',
  policy: 'Risky change',
  brief: 'Brief',
  reroute: 'Reroute',
  'reroute-suggested': 'Reroute?',
  trust: 'Approve on this machine',
  guide: 'Approve a guide',
  'guide-checks': 'Approve guide checks',
  knowledge: 'Field guide',
  overlap: 'Same files',
  integration: 'Branches clash',
  precedent: 'Your decision',
  flag: 'PR or CI',
  'tracker-settings': 'Settings changed',
  'review-limit': 'Review waits',
};

/** The words on a card that needs you: by the most urgent item on it. */
export function cardNeedText(item: AttentionItem) {
  return CARD_TEXT[item.kind] ?? 'needs you';
}

/** The words after the key, for what the human does: "Answer claude-05", "Merge PR #14", "Approve". */
function verb(item: AttentionItem) {
  if (item.kind === 'question') return item.agent ? `Answer ${item.agent}` : 'Answer';
  if (item.kind === 'merge') return item.title.match(/PR #\d+/)?.[0].replace('PR', 'Merge PR') ?? 'Merge';
  if (item.kind === 'main-checks')
    return item.title
      .split(':')[0]
      .replace(' already', '')
      .replace(/ on main$/, '');
  return CHIP_VERB[item.kind] ?? KIND_LABEL[item.kind];
}

/**
 * One thing that needs you on the trail bar, as short as a chip can be: the ticket's key and what to do with it
 * ("#6 Answer claude-05", "#12 Merge PR #14"), "main: …" for checks on main, else the kind ("Brief", "Reroute").
 */
export function needLabel(item: AttentionItem, keyOf: (ticketId: string) => string | undefined) {
  const key = item.ticketId ? keyOf(item.ticketId) : undefined;
  if (item.kind === 'main-checks') return `main: ${verb(item)}`;
  return key ? `${key} ${verb(item)}` : verb(item);
}
