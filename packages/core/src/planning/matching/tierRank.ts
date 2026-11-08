import { MODEL_TIERS, type ModelTier } from '../../model/modelTier';

/** 0 for fast, 1 for balanced, 2 for strongest. */
export const tierRank = (t: ModelTier) => MODEL_TIERS.indexOf(t);
