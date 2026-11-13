import type { MapDoc } from '../../model/types';
import { OperationError } from './operationError';

/** Refuses work on an archived trail: it is history now, and only the trail lead can restore it. */
export function assertNotArchived(map: Pick<MapDoc, 'key' | 'title' | 'archived'>) {
  if (map.archived)
    throw new OperationError(
      `Trail ${map.key} "${map.title}" is archived: no work is taken from it. Only the trail lead can restore it in the Lookout.`,
    );
}
