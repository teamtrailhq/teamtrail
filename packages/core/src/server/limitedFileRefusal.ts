import { highRiskRefusal } from '../model/highRiskRefusal';
import { ticketNeedsLookout } from '../policy/ticketNeedsLookout';
import { fieldsOfText } from '../signedState/itemCodec';
import { changedKeys } from '../signedState/stateFields';
import { stateItemOf, type StateItem } from '../signedState/stateItem';

/** The ticket fields that close or reopen it: how the Lookout resolves a ticket through this route. */
const CLOSING = ['state', 'close_reason'];

/** Whether a ticket file's write closes or reopens it; a version that can't be read counts as one that does. */
function changesState(item: StateItem, before: string | undefined, after: string) {
  if (before === undefined) return false;
  const was = fieldsOfText(item, before);
  const now = fieldsOfText(item, after);
  if (!was || !now) return true;
  return changedKeys(was, now).some((k) => CLOSING.includes(k));
}

/** The tickets a decision file is about, before and after the write. */
function decisionTickets(item: StateItem, before: string | undefined, after: string) {
  const ticketOf = (text: string | undefined) => (text === undefined ? null : fieldsOfText(item, text)?.ticket);
  return [ticketOf(before), ticketOf(after)].filter((t): t is string => typeof t === 'string' && t !== '');
}

/** The tickets this write decides: one it closes or reopens, the ticket of a decision it writes. */
function decidedTickets(item: StateItem, before: string | undefined, after: string): string[] {
  if (item.kind === 'ticket') return changesState(item, before, after) ? [item.id] : [];
  if (item.kind === 'decision') return decisionTickets(item, before, after);
  return [];
}

/**
 * Why a caller not allowed high-risk calls (limitedRequests.ts) may not write this tracker file, or undefined when
 * it may. The Lookout resolves a ticket by writing it closed and writing its decision: on a ticket only the Lookout's
 * full word may decide (policy/ticketNeedsLookout.ts), neither goes through. Everything else is as for any caller
 * (and, from another device, lanFileRefusal.ts).
 */
export async function limitedFileRefusal(
  root: string,
  write: { rel: string; before: string | undefined; after: string },
): Promise<string | undefined> {
  const item = stateItemOf(write.rel);
  if (!item) return undefined;
  for (const ticketId of decidedTickets(item, write.before, write.after))
    if (await ticketNeedsLookout(root, item.mapId, ticketId))
      return highRiskRefusal(`Ticket ${ticketId}`, 'lookout-limited');
  return undefined;
}
