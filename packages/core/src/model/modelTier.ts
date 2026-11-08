/**
 * How capable a model is, for matching work to the agent sessions that fit it. Teamtrail never picks or switches a
 * model: it reads the one a session runs on and offers that session the tickets set for its tier.
 */
export type ModelTier = 'fast' | 'balanced' | 'strongest';

/** Weakest first: a session takes tickets at its tier, then lower tiers, never higher. */
export const MODEL_TIERS: ModelTier[] = ['fast', 'balanced', 'strongest'];

/** The tier a session counts as when it reports no model, or one no table knows. */
export const UNKNOWN_MODEL_TIER: ModelTier = 'balanced';

/**
 * Model ids by family, first match wins (globs, `*` for any run of characters, case-insensitive). Data only:
 * a project adds new or custom models in `.teamtrail/models.json`, which is read before this table.
 */
export const MODEL_FAMILIES: readonly (readonly [pattern: string, tier: ModelTier])[] = [
  ['*-mini', 'fast'],
  ['*-mini-*', 'fast'],
  ['*-nano', 'fast'],
  ['*-nano-*', 'fast'],
  ['*claude-haiku-*', 'fast'],
  ['*claude-3*-haiku*', 'fast'],
  ['*claude-opus-*', 'strongest'],
  ['*claude-3*-opus*', 'strongest'],
  ['*claude-fable-*', 'strongest'],
  ['*claude-sonnet-*', 'balanced'],
  ['*claude-3*-sonnet*', 'balanced'],
  ['gpt-5*', 'strongest'],
  ['o1', 'strongest'],
  ['o1-*', 'strongest'],
  ['o3', 'strongest'],
  ['o3-*', 'strongest'],
  ['o4-*', 'strongest'],
  ['gpt-4*', 'balanced'],
];

export const isModelTier = (v: unknown): v is ModelTier => MODEL_TIERS.includes(v as ModelTier);

/** The project's extra models: `.teamtrail/models.json`. Optional; committed. */
export const MODELS_FILE = 'models.json';
