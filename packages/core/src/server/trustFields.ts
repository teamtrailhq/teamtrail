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
/** MapMetaPatch and TicketMetaPatch fields, and MapInput's, for tracker calls. */
export const MAP_META_TRUST = ['verification', 'guides', 'modelMatching'];
export const TICKET_META_TRUST = ['verification', 'checks', 'guide', 'reviewOf'];
/**
 * The only gate fields of a ticket (signedState/stateFields.ts) a device on the network may change through the raw
 * file route: what the phone needs to move work along (its state, status and how it closed). Its type, the hitl
 * label, its blockers, its assignee, a trail's mode or guides, and every decision are this machine's: Teamtrail signs
 * what the file route writes, so these would otherwise be signed as the trail lead's.
 */
export const LAN_TICKET_FIELDS = ['state', 'status', 'close_reason'];
/** Assignees that are the human, not an agent. */
export const HUMAN_ASSIGNEE = /^(trail lead|operator|slack:.*)$/i;

export const TRUST_REFUSED =
  'That changes what this machine checks or trusts (a verification level, checks, guides, model matching, a ticket’s type, blockers or assignee, or something recorded as yours): it can only be done on the machine Teamtrail runs on. Open the Lookout there.';
