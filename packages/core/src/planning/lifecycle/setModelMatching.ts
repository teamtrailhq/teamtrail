import type { TrackerAdapter } from '../../adapters/adapter';
import type { ActorKind } from '../../model/lifecycle';
import { isModelTier } from '../../model/modelTier';
import { ALL_TICKET_TYPES, type ModelMatching, type TicketType } from '../../model/types';
import { OperationError } from '../operations/operationError';

/**
 * Turns a trail's model matching on or off and sets its tier per ticket type; `null` clears it (off).
 * Trail lead only: the human sets the policy, agents only follow it. It applies from the next claim.
 */
export async function setModelMatching(
  adapter: TrackerAdapter,
  mapId: string,
  value: ModelMatching | null,
  actorKind: ActorKind,
) {
  if (actorKind !== 'trail lead') throw new OperationError('only the trail lead can change model matching');
  if (value) assertValid(value);
  await adapter.setMapMeta(mapId, { modelMatching: value && clean(value) });
}

function assertValid(value: ModelMatching) {
  if (typeof value.enabled !== 'boolean') throw new OperationError('"enabled" must be true or false');
  for (const [type, tier] of Object.entries(value.tiers ?? {})) {
    if (!ALL_TICKET_TYPES.includes(type as TicketType)) throw new OperationError(`unknown ticket type "${type}"`);
    if (!isModelTier(tier)) throw new OperationError(`"${type}" must be fast, balanced or strongest`);
  }
}

/** Only the fields Teamtrail keeps, with no empty tier map. */
function clean(value: ModelMatching): ModelMatching {
  const tiers = Object.fromEntries(Object.entries(value.tiers ?? {}).filter(([, tier]) => tier));
  return Object.keys(tiers).length ? { enabled: value.enabled, tiers } : { enabled: value.enabled };
}
