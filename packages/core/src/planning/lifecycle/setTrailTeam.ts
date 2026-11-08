import type { TrackerAdapter } from '../../adapters/adapter';
import type { ActorKind } from '../../model/lifecycle';
import { OperationError } from '../operations/operationError';

/**
 * Sets a trail's team (the role ids its tickets use), or clears it with `null` or `[]`. An agent may only name the
 * team of a trail that has none (start_trail); after that it is the trail lead's to change.
 */
export async function setTrailTeam(
  adapter: TrackerAdapter,
  mapId: string,
  roles: string[] | null,
  actorKind: ActorKind,
) {
  if (actorKind === 'agent') {
    const { map } = await adapter.loadMap(mapId);
    if (map.roles?.length || !roles?.length) throw new OperationError("only the trail lead can change a trail's team");
  }
  await adapter.setMapMeta(mapId, { roles: roles?.length ? [...new Set(roles)] : null });
}
