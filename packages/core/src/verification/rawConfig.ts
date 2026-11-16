import { readFileSync } from 'node:fs';
import { OperationError } from '../planning/operations/operationError';
import { VERIFICATION_FILE } from './configFile';

export type RawConfig = { checks?: Record<string, unknown>; run?: unknown; default?: unknown } & Record<
  string,
  unknown
>;

/** verification.json as JSON, its other fields kept as they are; `fresh` when there is no file yet. */
export function readRawConfig(file: string, fresh: RawConfig): RawConfig {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return fresh;
  }
  try {
    return JSON.parse(text) as RawConfig;
  } catch {
    throw new OperationError(`${VERIFICATION_FILE} is not valid JSON; fix it first`);
  }
}
