import type { RerouteChange, RerouteProposal } from '../../model/reroute';
import { contentHash, trustKey, trustLedger } from '../../trust/trustLedger';

/*
 * A proposal is a file an agent writes, and approving it changes the map. So the approval is of its content, not
 * its id: the page sends the hash of what it showed, the bridge refuses a file that differs, and what is applied
 * is the approved content kept on this machine (trust/trustLedger.ts), never what the file says afterwards. The
 * progress of an interrupted apply lives there too.
 */

/** What an approval covers: everything that decides what the reroute does. */
type Approved = Pick<
  RerouteProposal,
  'kind' | 'destinationReason' | 'reason' | 'evidence' | 'invalidates' | 'changes' | 'lane' | 'by'
>;

export function rerouteContent(p: RerouteProposal): string {
  const core: Approved & { id: string; mapId: string } = {
    id: p.id,
    mapId: p.mapId,
    kind: p.kind,
    // the lane decides how approving is recorded, and who asked is part of what was shown
    lane: p.lane,
    by: p.by,
    destinationReason: p.destinationReason,
    reason: p.reason,
    evidence: p.evidence,
    invalidates: p.invalidates,
    changes: p.changes,
  };
  return JSON.stringify(core);
}

export const rerouteHash = (p: RerouteProposal) => contentHash(rerouteContent(p));

interface Kept {
  core: Approved;
  applied: number[];
  created: Record<number, string>;
}

const read = (root: string, p: Pick<RerouteProposal, 'mapId' | 'id'>): Kept | undefined => {
  const content = trustLedger(root).get(trustKey.reroute(p.mapId, p.id))?.content;
  if (!content) return undefined;
  try {
    const k = JSON.parse(content) as Kept;
    return Array.isArray(k.core?.changes) && Array.isArray(k.applied) ? k : undefined;
  } catch {
    return undefined;
  }
};

function write(root: string, p: RerouteProposal, by: string) {
  const core = JSON.parse(rerouteContent(p)) as Approved;
  const kept: Kept = { core, applied: p.applied, created: p.created };
  const record = { hash: rerouteHash(p), at: Date.now(), by, content: JSON.stringify(kept) };
  trustLedger(root).set({ [trustKey.reroute(p.mapId, p.id)]: record });
}

/** The trail lead approved this proposal, as it is, on this machine. */
export const keepApprovedReroute = write;

/** Saves how far the apply got, next to the approved content. */
export const keepRerouteProgress = write;

/**
 * The proposal as approved here, with this machine's record of what was applied: the file supplies only who and
 * when. Undefined when this machine holds no approval for it, whatever the file's status says.
 */
export function approvedReroute(root: string, file: RerouteProposal): RerouteProposal | undefined {
  const kept = read(root, file);
  if (!kept) return undefined;
  const changes: RerouteChange[] = kept.core.changes;
  return { ...file, ...kept.core, changes, applied: kept.applied, created: kept.created ?? {} };
}
