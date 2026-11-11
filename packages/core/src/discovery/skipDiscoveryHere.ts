import type { RerouteProposal } from '../model/reroute';
import { rerouteHash } from '../planning/reroute/rerouteApproval';
import { trustKey, trustLedger } from '../trust/trustLedger';
import { dropBrief } from './briefStore';

/**
 * The trail lead approved a request to skip discovery: recorded on this machine (who, when, and the hash of the
 * request they approved), which is what opens the gate (discoveryGate.ts); the brief file then goes, as it no longer
 * says anything. Returns the discovery ticket's id, for the caller to rule it out.
 */
export function skipDiscoveryHere(root: string, s: { mapId: string; request: RerouteProposal; by: string }) {
  const hash = rerouteHash(s.request);
  const content = JSON.stringify({ request: s.request.id, hash });
  trustLedger(root).set({ [trustKey.discoverySkipped(s.mapId)]: { hash, at: Date.now(), by: s.by, content } });
  return dropBrief(root, s.mapId);
}
