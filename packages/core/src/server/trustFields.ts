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
/** Assignees that are the human, not an agent. */
export const HUMAN_ASSIGNEE = /^(trail lead|operator|slack:.*)$/i;

export const TRUST_REFUSED =
  'That changes what this machine checks or trusts (a verification level, checks, guides, model matching, or something recorded as yours): it can only be done on the machine Teamtrail runs on. Open the Lookout there.';
