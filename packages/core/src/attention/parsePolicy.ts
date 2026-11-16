import type { AttentionKind, AttentionPolicy } from '../model/attention';
import { REVIEW_LIMIT_RANGE } from '../model/reviewLoad';
import { ATTENTION_KINDS, DEFAULT_ATTENTION_POLICY } from './defaults';

export interface Parsed<T> {
  /** The defaults where the file is missing or wrong, so the queue keeps working. */
  value: T;
  /** Every problem, one line each; empty when the file is valid. */
  errors: string[];
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isNumberIn = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

const KEYS = ['v', 'weights', 'interrupt', 'digestMinutes', 'reviewLimit'];

function parseWeights(raw: unknown, errors: string[]): Record<AttentionKind, number> {
  const weights = { ...DEFAULT_ATTENTION_POLICY.weights };
  if (raw === undefined) return weights;
  if (!isObject(raw)) {
    errors.push('"weights" must be an object of kind: 0–100');
    return weights;
  }
  for (const [kind, w] of Object.entries(raw)) {
    if (!ATTENTION_KINDS.includes(kind as AttentionKind)) {
      errors.push(`unknown kind "${kind}" in "weights" (one of ${ATTENTION_KINDS.join(', ')})`);
      continue;
    }
    if (isNumberIn(w, 0, 100)) weights[kind as AttentionKind] = w;
    else errors.push(`weights.${kind} must be a number from 0 to 100`);
  }
  return weights;
}

/** `attention.json`, checked by hand like verification.json: unknown keys and bad values are all reported. */
export function parseAttentionPolicy(raw: unknown): Parsed<AttentionPolicy> {
  const errors: string[] = [];
  if (!isObject(raw)) return { value: DEFAULT_ATTENTION_POLICY, errors: ['must be a JSON object'] };
  for (const k of Object.keys(raw)) if (!KEYS.includes(k)) errors.push(`unknown key "${k}"`);
  if (raw.v !== 1) errors.push('"v" must be 1');
  const value: AttentionPolicy = { ...DEFAULT_ATTENTION_POLICY, weights: parseWeights(raw.weights, errors) };
  if (raw.interrupt !== undefined) {
    if (isNumberIn(raw.interrupt, 0, 200)) value.interrupt = raw.interrupt;
    else errors.push('"interrupt" must be a number from 0 to 200');
  }
  if (raw.digestMinutes !== undefined) {
    if (isNumberIn(raw.digestMinutes, 0, 7 * 24 * 60)) value.digestMinutes = raw.digestMinutes;
    else errors.push('"digestMinutes" must be minutes from 0 (off) to 10080');
  }
  parseReviewLimit(raw.reviewLimit, value, errors);
  return { value, errors };
}

/** `reviewLimit`: a whole number of waiting reviews; missing or `null` is off. */
function parseReviewLimit(raw: unknown, value: AttentionPolicy, errors: string[]) {
  if (raw === undefined || raw === null) return;
  const { min, max } = REVIEW_LIMIT_RANGE;
  if (isNumberIn(raw, min, max) && Number.isInteger(raw)) value.reviewLimit = raw;
  else errors.push(`"reviewLimit" must be a whole number from ${min} to ${max}, or null (off)`);
}
