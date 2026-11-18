import type { MapDoc } from '../../model/types';
import { OperationError } from '../../planning/operations/operationError';
import { mapBody } from './format';

type MapParts = Pick<MapDoc, 'sections' | 'verification' | 'modelMatching' | 'guides' | 'guidesByType'>;

/**
 * Refuses a trail whose issue body would be longer than the tracker takes (GitHub: 65,536 characters), before
 * anything is sent or queued, so a long destination or notes is a message to shorten them, not a write that fails
 * on every retry.
 */
export function assertMapBodyFits(map: MapParts, o: { limit?: number; tracker: string }) {
  if (o.limit === undefined) return;
  const length = mapBody(map).length;
  if (length <= o.limit) return;
  const n = (x: number) => x.toLocaleString('en-US');
  throw new OperationError(
    `This trail is too long for ${o.tracker}: ${n(length)} characters with its destination, notes and assumptions, at most ${n(o.limit)}. Shorten the notes.`,
  );
}
