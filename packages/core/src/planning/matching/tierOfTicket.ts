import { MODEL_TIERS, type ModelTier } from '../../model/modelTier';
import { ALL_TICKET_TYPES, type MapDoc, type Ticket, type TicketType } from '../../model/types';
import { DEFAULT_TIER_MAP } from './defaultTierMap';

/** The tier a ticket is set for: the trail's own choice for its type, else the default. The one place it's resolved. */
export function tierOfTicket(
  ticket: Pick<Ticket, 'type'>,
  map: Pick<MapDoc, 'modelMatching' | 'settingsUnconfirmed'>,
): ModelTier {
  const set = map.modelMatching?.tiers?.[ticket.type];
  const fallback = DEFAULT_TIER_MAP[ticket.type];
  // Someone else's model matching nobody here confirmed: never a weaker model than the default asks for.
  if (map.settingsUnconfirmed && set) return MODEL_TIERS.indexOf(set) >= MODEL_TIERS.indexOf(fallback) ? set : fallback;
  return set ?? fallback;
}

/** Every ticket type's tier on this trail, defaults filled in. */
export function effectiveTiers(
  map: Pick<MapDoc, 'modelMatching' | 'settingsUnconfirmed'>,
): Record<TicketType, ModelTier> {
  return Object.fromEntries(ALL_TICKET_TYPES.map((type) => [type, tierOfTicket({ type }, map)])) as Record<
    TicketType,
    ModelTier
  >;
}
