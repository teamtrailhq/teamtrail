import type { TrackerAdapter } from '../../adapters/adapter';
import type { ActorKind } from '../../model/lifecycle';
import { ALL_TICKET_TYPES, type GuidesByType } from '../../model/types';
import { OperationError } from '../operations/operationError';

/** The mapping as it is kept: every ticket type that has guides, in one order, each id once. */
export function tidyGuidesByType(byType: GuidesByType): GuidesByType {
  const out: GuidesByType = {};
  for (const type of ALL_TICKET_TYPES) {
    const ids = [...new Set(byType[type] ?? [])].filter(Boolean);
    if (ids.length) out[type] = ids;
  }
  return out;
}

/**
 * Sets a trail's guides by ticket type, or with `null` puts it back on the defaults. Either way the team it may have
 * had from before guides came by type is cleared: the mapping is the whole setting now. Trail lead only, written as
 * theirs (`confirm`); an agent can't change it. Callers check every id is an active guide (`guideProblem`).
 */
export async function setTrailGuides(
  adapter: TrackerAdapter,
  mapId: string,
  byType: GuidesByType | null,
  actorKind: ActorKind,
) {
  if (actorKind !== 'trail lead') throw new OperationError("only the trail lead can change a trail's guides");
  const guidesByType = byType ? tidyGuidesByType(byType) : null;
  await adapter.setMapMeta(mapId, { guidesByType, guides: null, confirm: true });
}
