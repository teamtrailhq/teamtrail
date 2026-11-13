import type { TrackerAdapter } from '../../adapters/adapter';
import type { ActorKind } from '../../model/lifecycle';
import { OperationError } from '../operations/operationError';

/**
 * Archives a trail, or restores it. Trail lead only: an archived trail stays as history (its tickets, decisions and
 * journal are kept), drops out of the active trails and the queue, and no agent takes work from it.
 */
export async function setTrailArchived(
  adapter: TrackerAdapter,
  mapId: string,
  archived: boolean,
  actorKind: ActorKind,
) {
  if (actorKind !== 'trail lead') throw new OperationError('only the trail lead can archive or restore a trail');
  await adapter.setMapArchived(mapId, archived);
}
