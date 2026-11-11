import type { TicketType } from '../model/types';
import { trustKey, trustLedger } from '../trust/trustLedger';
import { DISCOVERY_TYPES, gateReason } from './brief';
import { readBrief } from './briefStore';

/*
 * Whether a trail still requires discovery is this machine's fact, not the repo's: every trail does, unless the trail
 * lead skipped it here (the trust ledger's `discovery-skipped:<mapId>`, written when they approve a skip request,
 * reroute/decideReroute.ts, or adopt a trail charted without discovery, trust/discoveryItems.ts). The brief file only
 * says how far discovery got: deleting it, or putting something else in its place, opens nothing.
 */

/** The trail lead skipped discovery for this trail on this machine. */
export const discoverySkipped = (root: string, mapId: string) =>
  !!trustLedger(root).get(trustKey.discoverySkipped(mapId));

/** Discovery still gates this trail: not skipped here, and no brief accepted here. */
export function requiresDiscovery(root: string, mapId: string): boolean {
  if (discoverySkipped(root, mapId)) return false;
  return readBrief(root, mapId)?.status !== 'accepted';
}

const MISSING =
  'This trail needs an accepted discovery brief before %s tickets can be claimed, and the brief file is missing; only the trail lead can skip discovery. Work research and junction tickets meanwhile, or write the brief with submit_brief.';

/** Ticket types an agent may claim on the trail now: `undefined` means any. */
export const claimableNow = (root: string, mapId: string): TicketType[] | undefined =>
  requiresDiscovery(root, mapId) ? DISCOVERY_TYPES : undefined;

/** Why a claim of `type` is refused by the discovery gate, or `undefined` when it's allowed. */
export function discoveryRefusal(root: string, mapId: string, type: TicketType): string | undefined {
  if (!requiresDiscovery(root, mapId) || DISCOVERY_TYPES.includes(type)) return undefined;
  const brief = readBrief(root, mapId);
  return brief ? gateReason(brief, type) : MISSING.replace('%s', type);
}
