import { MODEL_TIERS, type ModelTier } from '@teamtrail/core';

/** How a tier reads in the Lookout. */
export const TIER_TEXT: Record<ModelTier, string> = {
  fast: 'Fast',
  balanced: 'Balanced',
  strongest: 'Strongest',
};

const TIER_HINT: Record<ModelTier, string> = {
  fast: 'Haiku, mini and nano models',
  balanced: 'Sonnet, GPT-4 models',
  strongest: 'Opus, GPT-5 and o-series models',
};

/** The tier picker's choices, weakest first. */
export const TIER_OPTIONS = MODEL_TIERS.map((value) => ({ value, label: TIER_TEXT[value], hint: TIER_HINT[value] }));
