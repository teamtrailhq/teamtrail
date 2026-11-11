import { LAN_TICKET_CHANGES, TRUST_REFUSED } from './trustFields';

/** Calls that only read. */
const READS = new Set(['listMaps', 'loadMap', 'listDecisions']);
/** Calls that change only free text: a comment, a ticket's title or body. */
const TEXT = new Set(['comment', 'editTicket']);
/**
 * Map sections that count: what the trail is for and its assumptions (signedState/stateFields.ts), and the decisions
 * so far, which the Decisions view reads (decisionAudit.ts).
 */
const COUNTED_SECTIONS = ['destination', 'assumptions', 'decisions'];

const changes = Object.values(LAN_TICKET_CHANGES);
/** The calls that make a change a device on the network may make, from the one definition (trustFields.ts). */
const PROGRESS = new Set(changes.flatMap((c) => c.calls));
const META = new Set(changes.flatMap((c) => (c.meta ? [c.meta] : [])));

const keysOf = (v: unknown) =>
  v && typeof v === 'object' ? Object.keys(v).filter((k) => (v as Record<string, unknown>)[k] !== undefined) : [];

/** Whether one call is allowed from another device, by its method and arguments. */
function allowed(method: string, args: unknown[]): boolean {
  if (READS.has(method) || TEXT.has(method)) return true;
  if (method === 'updateMapSections') return !keysOf(args[1]).some((k) => COUNTED_SECTIONS.includes(k));
  if (!PROGRESS.has(method)) return false;
  return method !== 'setMeta' || keysOf(args[2]).every((k) => META.has(k));
}

/**
 * Why a device on the network may not make this tracker call (`/tracker/<kind>/call`), or undefined when it
 * may. The same limits as the raw file route (lanFileRefusal.ts), for GitHub and Linear: it reads, edits text and
 * moves a ticket along (its state, status and close, trustFields.ts `LAN_TICKET_CHANGES`). Everything else, from
 * a ticket's type, hitl, blockers or assignee to a trail's mode, destination, settings or guides, a decision, or a
 * new trail or ticket, is this machine's; so is any call not named here.
 */
export function lanCallRefusal(method: string, args: unknown[]): string | undefined {
  return allowed(method, args) ? undefined : TRUST_REFUSED;
}
