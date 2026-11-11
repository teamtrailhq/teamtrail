import type { TrackerAdapter } from '../adapters/adapter';
import type { MapSnapshot } from '../model/types';
import { frozenTickets } from '../planning/reroute/frozenTickets';
import { listReroutes } from '../planning/reroute/rerouteStore';
import { rerouteTriggers } from '../planning/reroute/rerouteTriggers';
import { trustedChecks } from '../verification/checksApproval';
import { DEFAULT_CONFIG } from '../verification/config';
import { readAttempts } from '../verification/evidenceStore';
import type { AttentionInput } from './types';

/**
 * What the reroute sources read: every pending proposal with the tickets it freezes, and the triggers' suggestions,
 * fed from failed attempts, the `maxAttempts` setting and pull requests closed without merging.
 */
export async function rerouteInputs(input: {
  root: string;
  adapter: TrackerAdapter;
  snaps: MapSnapshot[];
  syncs: AttentionInput['syncs'];
}): Promise<Pick<AttentionInput, 'reroutes' | 'suggestions'>> {
  const { root, adapter, snaps, syncs } = input;
  const reroutes = snaps.flatMap((s) => pendingReroutes(root, s.map.id));
  const maxAttempts = (trustedChecks(root).config.config ?? DEFAULT_CONFIG).maxAttempts;
  const closedUnmerged = syncs
    .filter((s) => s.flags.some((f) => f.kind === 'pr-closed-unmerged'))
    .map((s) => s.ticketId);
  const suggestions = await Promise.all(
    snaps.map(async (snap) =>
      rerouteTriggers({
        snap,
        decisions: await adapter.listDecisions(snap.map.id),
        failures: failuresOf(root, snap),
        maxAttempts,
        closedUnmerged,
      }),
    ),
  );
  return { reroutes, suggestions: suggestions.flat() };
}

function pendingReroutes(root: string, mapId: string) {
  const pending = listReroutes(root, mapId).filter((p) => p.status === 'pending');
  const frozen = frozenTickets(pending);
  return pending.map((proposal) => ({
    proposal,
    frozen: [...frozen].filter(([, id]) => id === proposal.id).map(([ticketId]) => ticketId),
  }));
}

/** Failed attempts per blocked ticket; only blocked tickets can trigger "blocked after attempts". */
function failuresOf(root: string, snap: MapSnapshot) {
  const blocked = snap.tickets.filter((t) => t.state === 'open' && t.status === 'blocked');
  const counts = blocked.map((t) => {
    const failed = readAttempts(root, snap.map.id, t.id).filter((a) => a.result === 'fail').length;
    return [t.id, failed] as const;
  });
  return Object.fromEntries(counts);
}
