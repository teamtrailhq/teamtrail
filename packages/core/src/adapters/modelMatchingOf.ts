import { isModelTier, type ModelTier } from '../model/modelTier';
import { ALL_TICKET_TYPES, type ModelMatching, type TicketType } from '../model/types';

/** A trail's model matching as stored, read leniently: unknown types and tiers are dropped, anything else is off. */
export function modelMatchingOf(raw: unknown): ModelMatching | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as { enabled?: unknown; tiers?: unknown };
  if (typeof o.enabled !== 'boolean') return undefined;
  const tiers = tiersOf(o.tiers && typeof o.tiers === 'object' ? Object.entries(o.tiers) : []);
  return Object.keys(tiers).length ? { enabled: o.enabled, tiers } : { enabled: o.enabled };
}

/** `[type, tier]` pairs as a tier map, keeping only real ticket types and tiers. */
export function tiersOf(pairs: [string, unknown][]): Partial<Record<TicketType, ModelTier>> {
  const valid = pairs.filter(([type, tier]) => ALL_TICKET_TYPES.includes(type as TicketType) && isModelTier(tier));
  return Object.fromEntries(valid) as Partial<Record<TicketType, ModelTier>>;
}
