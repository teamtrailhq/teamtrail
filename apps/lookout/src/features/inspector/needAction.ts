import type { AttentionKind } from '@teamtrail/core';

/**
 * How the human acts on what the queue holds on a ticket: one of the ticket's own actions (`menu`, by its id; when the
 * ticket has none by that id, `otherwise`), the
 * place the item is handled (`item`: the brief, a reroute, Approvals…), its pull request (`pr`), setting it aside
 * once looked at (`dismiss`), or the queue's one-click action in place (`inline`).
 */
export type NeedAct =
  | { kind: 'menu'; id: string; otherwise?: NeedAct }
  | { kind: 'item'; label: string }
  | { kind: 'pr'; label: string }
  | { kind: 'dismiss'; label: string }
  | { kind: 'inline' };

/** What is asked, after "Waiting on you: ", and how to do it. */
export interface NeedAction {
  ask: string;
  act?: NeedAct;
}

const open = (label: string): NeedAct => ({ kind: 'item', label });

/**
 * The kinds the state line doesn't already ask in its own words (a question, an approval, a held ticket, a decision
 * that is yours, a stalled claim, a model wait). Every other item on a ticket is asked here, with its action.
 */
const NEEDS: Partial<Record<AttentionKind, NeedAction>> = {
  brief: { ask: 'review the discovery brief', act: open('Review the brief') },
  reroute: { ask: 'review the reroute', act: open('Review the reroute') },
  // only a suggestion: there is no proposal to review until an agent makes one
  'reroute-suggested': { ask: 'decide whether to reroute', act: { kind: 'dismiss', label: 'Carry on' } },
  trust: { ask: 'review what changed', act: open('Open Approvals') },
  escape: { ask: 'decide on a rule', act: open('Add a rule') },
  criteria: { ask: 'confirm its criteria', act: { kind: 'menu', id: 'confirm-criteria' } },
  knowledge: { ask: 'review the field guide', act: open('Open the field guide') },
  guide: { ask: 'review the guide', act: open('Review the guide') },
  'guide-checks': { ask: "review the guide's checks", act: open('Review the guide') },
  'main-checks': { ask: 'checks fail on main', act: open('Open checks on main') },
  'trail-checks': { ask: 'checks fail on main together', act: open('Open checks on main') },
  delivery: { ask: 'a message could not be delivered', act: open('Open its settings') },
  // merged here where a server merges pull requests (mergeAction.ts), else on the pull request itself
  merge: {
    ask: 'merge its pull request',
    act: { kind: 'menu', id: 'merge', otherwise: { kind: 'pr', label: 'Open the PR' } },
  },
  flag: { ask: 'look at its pull request', act: { kind: 'pr', label: 'Open the PR' } },
  policy: { ask: 'check the risky change', act: { kind: 'dismiss', label: 'Checked: set aside' } },
  overlap: { ask: 'hold one claim', act: { kind: 'menu', id: 'release-lease' } },
  integration: { ask: 'settle the branches that clash', act: { kind: 'inline' } },
  'tracker-settings': { ask: 'settle its changed settings', act: { kind: 'inline' } },
  'tracker-refused': { ask: 'retry or discard what the tracker refused', act: { kind: 'inline' } },
  precedent: { ask: 'check it against your decision' },
  'review-limit': { ask: 'review finished work first' },
};

/** What the state line asks for an item on the ticket, and the footer's primary action; none for kinds it asks itself. */
export function needAction(kind: AttentionKind): NeedAction | undefined {
  return NEEDS[kind];
}
