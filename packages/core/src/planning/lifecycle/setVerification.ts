import type { TrackerAdapter } from '../../adapters/adapter';
import type { ActorKind, VerificationLevel } from '../../model/lifecycle';
import { OperationError } from '../operations/operationError';

export interface VerificationTarget {
  mapId: string;
  /** Unset: the trail level. */
  ticketId?: string;
}

/**
 * Sets or clears (`null`) the verification level of a ticket or trail.
 * Trail lead only: an agent must not be able to lower what verifies its own work.
 */
export async function setVerification(
  adapter: TrackerAdapter,
  target: VerificationTarget,
  level: VerificationLevel | null,
  actorKind: ActorKind,
) {
  if (actorKind !== 'trail lead') throw new OperationError('only the trail lead can change a verification level');
  if (target.ticketId) await adapter.setMeta(target.mapId, target.ticketId, { verification: level, confirm: true });
  else await adapter.setMapMeta(target.mapId, { verification: level, confirm: true });
}
