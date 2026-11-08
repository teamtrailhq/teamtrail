import type { TrackerAdapter } from '../../adapters/adapter';
import type { ActorKind } from '../../model/lifecycle';
import { OperationError } from '../operations/operationError';

/**
 * Sets a trail's team (the guide ids its tickets use), or clears it with `null` or `[]`. An agent may only name the
 * team of a trail that has none (start_trail); after that it is the trail lead's to change.
 */
export async function setTrailTeam(
  adapter: TrackerAdapter,
  mapId: string,
  guides: string[] | null,
  actorKind: ActorKind,
) {
  if (actorKind === 'agent') {
    const { map } = await adapter.loadMap(mapId);
    if (map.guides?.length || !guides?.length)
      throw new OperationError("only the trail lead can change a trail's team");
  }
  await adapter.setMapMeta(mapId, { guides: guides?.length ? [...new Set(guides)] : null });
}
