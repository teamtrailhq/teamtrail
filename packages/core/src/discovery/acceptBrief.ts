import type { TrackerAdapter } from '../adapters/adapter';
import { seedFromBrief } from '../planning/assumptions/assumptionOps';
import { decided, type DiscoveryBrief } from './brief';
import { approveBriefHere, writeBriefText } from './briefStore';

/**
 * The trail lead accepts a submitted brief, whose shown hash the caller has checked (server/shownHash.ts): the file
 * says accepted, this machine records exactly the text written as approved, and the brief's assumptions become the
 * trail's. Throws when the brief isn't submitted.
 */
export async function acceptBrief(o: { root: string; adapter: () => Promise<TrackerAdapter>; brief: DiscoveryBrief }) {
  const next = decided(o.brief, { kind: 'accept' });
  const written = writeBriefText(o.root, next);
  approveBriefHere(o.root, o.brief.mapId, 'trail lead', written);
  const assumptions = await seedAssumptions(await o.adapter(), next);
  return { brief: next, assumptions };
}

/**
 * The accepted brief's assumptions become the trail's. The brief is already accepted by then, so a failure here
 * (the tracker unreachable, say) is logged and the accept still succeeds; accepting again seeds what's missing.
 */
async function seedAssumptions(adapter: TrackerAdapter, brief: DiscoveryBrief) {
  try {
    return await seedFromBrief(adapter, brief);
  } catch (e) {
    console.error(`could not add the brief's assumptions to the trail: ${(e as Error).message}`);
    return [];
  }
}
