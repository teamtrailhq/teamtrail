import type { GapAction, GapStanding } from '@teamtrail/core';
import type { MenuItem } from '../../components/ui';

/** How the Lookout does what closes a gap that is the human's (core's proof/gapPlan.ts). */
export interface GapRunners {
  confirm: () => void;
  verifyAgain: () => void;
  /** Opens the checks on main, when the queue holds them; undefined when it doesn't. */
  openMain?: () => void;
}

/** A gap action the ticket's own menu already has, by that item's id. */
const OWN_ITEM: Partial<Record<GapAction, string>> = {
  approve: 'approve',
  rework: 'rework',
  'accept-pass': 'accept',
  'confirm-criteria': 'confirm-criteria',
  'undo-waiver': 'undo-waiver',
};

function newItem(action: GapAction, run: GapRunners): MenuItem | undefined {
  switch (action) {
    case 'confirm-criteria':
      return {
        id: 'gap-confirm-criteria',
        label: 'Confirm criteria',
        tip: 'Agree they define done; the work is checked again against them by itself',
        onSelect: run.confirm,
      };
    case 'confirm-and-verify':
      return {
        id: 'gap-confirm-and-verify',
        label: 'Confirm criteria and verify again',
        tip: 'Agree they define done; its completion is checked again on the same commit, a new attempt for its proof',
        onSelect: run.confirm,
      };
    case 'verify-again':
      return {
        id: 'gap-verify-again',
        label: 'Verify again',
        tip: 'Check its completion again on the same commit against the confirmed criteria, a new attempt',
        onSelect: run.verifyAgain,
      };
    case 'open-main-checks':
      return run.openMain && { id: 'gap-open-main', label: 'Open checks on main', onSelect: run.openMain };
    default:
      return undefined;
  }
}

/**
 * The actions that close the human's gaps on the ticket's proof, each once, in the order of the gaps: the ticket's
 * own item when its menu has it (Approve, Send to rework…), otherwise one made for it. None for gaps no action closes.
 */
export function gapActionList(plan: GapStanding[], all: MenuItem[], run: GapRunners): Map<GapAction, MenuItem> {
  const items = new Map<GapAction, MenuItem>();
  for (const g of plan) {
    if (!g.action || items.has(g.action)) continue;
    const own = OWN_ITEM[g.action];
    const item = (own && all.find((a) => a.id === own)) || newItem(g.action, run);
    if (item) items.set(g.action, item);
  }
  return items;
}
