import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { MODELS_FILE, type ModelTier } from '../../model/modelTier';
import { parseModelsConfig } from './modelsFile';

export interface ModelsRead {
  /** The project's extra models; empty when the file is missing or broken. */
  models: Record<string, ModelTier>;
  errors: string[];
  exists: boolean;
}

/** The project's `models.json`; a missing file adds nothing, a broken one adds nothing and lists its errors. */
export function readModelsConfig(root: string): ModelsRead {
  const file = path.join(root, MODELS_FILE);
  if (!existsSync(file)) return { models: {}, errors: [], exists: false };
  const parsed = parseModelsConfig(readFileSync(file, 'utf8'));
  return { models: parsed.models ?? {}, errors: parsed.errors, exists: true };
}
