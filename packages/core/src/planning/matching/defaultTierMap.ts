import type { ModelTier } from '../../model/modelTier';
import type { TicketType } from '../../model/types';

/** The tier each ticket type is set for, unless the trail overrides it. */
export const DEFAULT_TIER_MAP: Record<TicketType, ModelTier> = {
  research: 'fast',
  task: 'balanced',
  execute: 'balanced',
  junction: 'strongest',
  prototype: 'strongest',
  review: 'strongest',
};
