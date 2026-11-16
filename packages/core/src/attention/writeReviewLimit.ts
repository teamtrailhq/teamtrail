import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from '../lib/jsonFile';
import type { AttentionPolicy } from '../model/attention';
import { parseJsonSafe } from '../model/safeKey';
import { ATTENTION_FILE } from './defaults';
import { parseAttentionPolicy, type Parsed } from './parsePolicy';

/**
 * Sets the team's review limit in attention.json (`null`: off), keeping every other key as written. Refuses, with
 * the reasons, a value out of range or a file that doesn't parse as JSON, so a hand-edited file is never clobbered.
 */
export function writeReviewLimit(root: string, limit: number | null): Parsed<AttentionPolicy> {
  const file = path.join(root, ATTENTION_FILE);
  let raw: Record<string, unknown> = { v: 1 };
  if (existsSync(file)) {
    try {
      const read = parseJsonSafe(readFileSync(file, 'utf8'));
      if (!read || typeof read !== 'object' || Array.isArray(read)) throw new Error('not a JSON object');
      raw = read as Record<string, unknown>;
    } catch (err) {
      return {
        value: parseAttentionPolicy({ v: 1 }).value,
        errors: [`${ATTENTION_FILE}: ${String(err)}; fix it by hand`],
      };
    }
  }
  const { reviewLimit: _old, ...rest } = raw;
  const next = limit === null ? rest : { ...rest, reviewLimit: limit };
  const parsed = parseAttentionPolicy(next);
  const own = parsed.errors.filter((e) => e.includes('"reviewLimit"'));
  if (own.length) return { value: parsed.value, errors: own };
  writeJsonAtomic(file, next);
  return { value: parsed.value, errors: [] };
}
