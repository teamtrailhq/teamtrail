import { highRiskRefusal } from '../model/highRiskRefusal';
import { ticketNeedsLookout } from '../policy/ticketNeedsLookout';

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

/** The ticket a tracker call decides, if any: one it closes or reopens, the ticket of a decision it records. */
function decidedTicket(method: string, args: unknown[]): string | undefined {
  if (method === 'close' || method === 'reopen') return str(args[1]);
  if (method === 'createDecision') return str((args[1] as { ticketId?: unknown } | undefined)?.ticketId);
  return undefined;
}

/**
 * Why a caller not allowed high-risk calls (limitedRequests.ts) may not make this tracker call (GitHub, Linear), or
 * undefined when it may: the same limit as the raw file route (limitedFileRefusal.ts). On a ticket only the Lookout's
 * full word may decide (policy/ticketNeedsLookout.ts), it can't close or reopen it, nor record a decision on it.
 */
export async function limitedCallRefusal(root: string, method: string, args: unknown[]): Promise<string | undefined> {
  const mapId = str(args[0]);
  const ticketId = decidedTicket(method, args);
  if (!mapId || !ticketId) return undefined;
  return (await ticketNeedsLookout(root, mapId, ticketId))
    ? highRiskRefusal(`Ticket ${ticketId}`, 'lookout-limited')
    : undefined;
}
