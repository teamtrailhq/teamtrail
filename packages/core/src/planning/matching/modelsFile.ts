import { isModelTier, MODEL_TIERS, type ModelTier } from '../../model/modelTier';

const KEYS = new Set(['v', 'models']);

/**
 * Reads `.teamtrail/models.json`: `{ "v": 1, "models": { "<model id or glob>": "fast" | "balanced" | "strongest" } }`.
 * Lists every problem; unknown keys are errors.
 */
export function parseModelsConfig(text: string): { models?: Record<string, ModelTier>; errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { errors: [`not valid JSON: ${(e as Error).message}`] };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { errors: ['must be a JSON object'] };
  const o = raw as Record<string, unknown>;
  const errors = Object.keys(o)
    .filter((k) => !KEYS.has(k))
    .map((k) => `unknown key "${k}"`);
  if (o.v !== 1) errors.push('"v" must be 1');
  const models = o.models ?? {};
  if (!models || typeof models !== 'object' || Array.isArray(models)) {
    errors.push('"models" must be an object of model id to tier');
    return { errors };
  }
  for (const [id, tier] of Object.entries(models)) {
    if (!id.trim()) errors.push('a model id is empty');
    if (!isModelTier(tier)) errors.push(`"${id}" must be one of ${MODEL_TIERS.join(', ')}`);
  }
  if (errors.length) return { errors };
  return { models: models as Record<string, ModelTier>, errors };
}
