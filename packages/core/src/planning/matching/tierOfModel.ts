import { MODEL_FAMILIES, UNKNOWN_MODEL_TIER, type ModelTier } from '../../model/modelTier';
import { modelIdMatch } from './modelIdMatch';

/** A session's tier, the model it was read from and why, in plain words. */
export interface SessionTier {
  tier: ModelTier;
  model?: string;
  /** `project`: `.teamtrail/models.json`; `built-in`: the model-family table; `unknown`: neither knows it. */
  source: 'project' | 'built-in' | 'unknown';
  reason: string;
}

/**
 * The tier of the model a session runs on: the project's own table first (exact ids before globs), then the
 * built-in families. No model, or one neither table knows, counts as balanced, so it never blocks work.
 */
export function tierOfModel(model: string | undefined, extra: Record<string, ModelTier> = {}): SessionTier {
  const id = model?.trim();
  if (!id)
    return { tier: UNKNOWN_MODEL_TIER, source: 'unknown', reason: 'no model reported, so it counts as balanced' };
  const exact = Object.entries(extra).find(([k]) => k.trim().toLowerCase() === id.toLowerCase());
  const own = exact ?? Object.entries(extra).find(([k]) => modelIdMatch(k, id));
  if (own) return { tier: own[1], model: id, source: 'project', reason: `${id} is ${own[1]} in models.json` };
  const family = MODEL_FAMILIES.find(([pattern]) => modelIdMatch(pattern, id));
  if (family) return { tier: family[1], model: id, source: 'built-in', reason: `${id} is a ${family[1]} model` };
  return {
    tier: UNKNOWN_MODEL_TIER,
    model: id,
    source: 'unknown',
    reason: `${id} is not a known model, so it counts as balanced`,
  };
}
