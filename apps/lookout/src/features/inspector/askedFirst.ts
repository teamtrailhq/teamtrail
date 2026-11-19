import type { AttentionItem } from '@teamtrail/core';

/**
 * A ticket's queue items in the queue's order, with the one a row of Needs you was opened for first: the ticket's
 * footer then asks that one and offers its action (an integration's, a merge's), never another item's on the ticket.
 */
export function askedFirst(items: AttentionItem[], id?: string): AttentionItem[] {
  const asked = items.find((i) => i.id === id);
  return asked ? [asked, ...items.filter((i) => i !== asked)] : items;
}
