import type { AttentionItem } from '@teamtrail/core';

/** Kinds handled outside a ticket, and the words for going there. */
const PLACE: Partial<Record<AttentionItem['kind'], string>> = {
  brief: 'Review the brief',
  reroute: 'Review the change',
  trust: 'Open Approvals',
  guide: 'Review the guide',
  'guide-checks': 'Review the guide',
  knowledge: 'Open the field guide',
  delivery: 'Open its settings',
  escape: 'Add a rule',
};

/**
 * The way to where the item is handled. None for an item about the trail on screen with no place of its own: its
 * one-click action (ItemAction) is in the row, and selecting the trail it's on would change nothing here.
 */
export function placeLabel(item: AttentionItem, current?: string) {
  const place = PLACE[item.kind];
  if (place) return place;
  if (item.ticketId || !item.mapId || item.mapId === current) return undefined;
  return 'Open its trail';
}
