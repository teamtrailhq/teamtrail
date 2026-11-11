/*
 * What only this machine may change about a trail or a ticket, whichever way the write arrives: the raw file
 * route (markdown trackers) or a tracker call (GitHub, Linear). These decide what is checked and who is trusted
 * (the verification level, the checks, the guides and with them their check commands, model matching, a review's
 * subject) or speak as the human (a ticket held by the trail lead, a decision on record). A device on the
 * network can read the trail, answer questions and edit text; these it can't touch until it has signed in.
 */

/** `map.md` frontmatter keys (mapFile.ts, modelMatchingFront.ts). */
export const MAP_TRUST_KEYS = ['verification', 'guides', 'model-matching', 'model-tiers'];
/** `tickets/<n>.md` frontmatter keys (ticketFile.ts). */
export const TICKET_TRUST_KEYS = ['verification', 'checks', 'guide', 'review_of'];
/**
 * The only gate fields of a ticket (signedState/stateFields.ts) a device on the network may change through the raw
 * file route: what the phone needs to move work along (its state, status and how it closed). Its type, the hitl
 * label, its blockers, its assignee, a trail's mode or guides, and every decision are this machine's: Teamtrail signs
 * what the file route writes, so these would otherwise be signed as the trail lead's. The same limits hold for a
 * GitHub or Linear call (lanCallRefusal.ts): each field names the tracker calls that make that change, and `meta` the
 * TicketMetaPatch key that sets it.
 */
export const LAN_TICKET_CHANGES: Record<string, { calls: string[]; meta?: string }> = {
  state: { calls: ['close', 'reopen'] },
  close_reason: { calls: ['close'] },
  status: { calls: ['setMeta'], meta: 'status' },
};
/** The gate fields of `LAN_TICKET_CHANGES`, as the raw file route checks them (lanFileRefusal.ts). */
export const LAN_TICKET_FIELDS = Object.keys(LAN_TICKET_CHANGES);
/** Assignees that are the human, not an agent. */
export const HUMAN_ASSIGNEE = /^(trail lead|operator|slack:.*)$/i;

export const TRUST_REFUSED =
  'That changes what this machine checks or trusts (a verification level, checks, guides, model matching, a ticket’s type, blockers or assignee, or something recorded as yours): it can only be done on the machine Teamtrail runs on. Open the Lookout there.';
