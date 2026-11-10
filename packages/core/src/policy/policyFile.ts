import {
  isRiskCategory,
  isRiskLevel,
  RISK_CATEGORIES,
  RISK_LEVELS,
  type RiskPathRule,
  type RiskPolicy,
} from '../model/risk';
import { parseJsonSafe } from '../model/safeKey';
import { DEFAULT_POLICY } from './defaultPolicy';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

const TOP_KEYS = ['v', 'categories', 'paths'];
const RULE_KEYS = ['glob', 'level', 'category'];
const LEVELS = RISK_LEVELS.join(', ');

/**
 * Parses `policy.json`. Every problem is reported, and `policy` is only set when there are none.
 * Categories the file leaves out keep their default level; `paths`, when present, replaces the default rules.
 */
export function parsePolicy(text: string): { policy?: RiskPolicy; errors: string[] } {
  let raw: unknown;
  try {
    raw = parseJsonSafe(text);
  } catch (e) {
    return { errors: [`not valid JSON: ${(e as Error).message}`] };
  }
  if (!isObj(raw)) return { errors: ['must be a JSON object'] };
  const errors: string[] = [];
  if (raw.v !== 1) errors.push('"v" must be 1');
  for (const k of Object.keys(raw)) if (!TOP_KEYS.includes(k)) errors.push(`unknown key "${k}"`);
  const categories = parseCategories(raw.categories, errors);
  const paths = raw.paths === undefined ? DEFAULT_POLICY.paths : parsePaths(raw.paths, errors);
  if (errors.length) return { errors };
  return { policy: { v: 1, categories, paths }, errors };
}

function parseCategories(v: unknown, errors: string[]): RiskPolicy['categories'] {
  const out = { ...DEFAULT_POLICY.categories };
  if (v === undefined) return out;
  if (!isObj(v)) {
    errors.push('"categories" must be an object of category: level');
    return out;
  }
  for (const [name, level] of Object.entries(v)) {
    if (!isRiskCategory(name)) {
      errors.push(`unknown category "${name}" (${RISK_CATEGORIES.join(', ')})`);
      continue;
    }
    if (isRiskLevel(level)) out[name] = level;
    else errors.push(`categories.${name} must be one of ${LEVELS}`);
  }
  return out;
}

function parsePaths(v: unknown, errors: string[]): RiskPathRule[] {
  if (!Array.isArray(v)) {
    errors.push('"paths" must be a list of { glob, level, category? }');
    return [];
  }
  return v.flatMap((rule, i) => parseRule(rule, `paths[${i}]`, errors));
}

function parseRule(v: unknown, at: string, errors: string[]): RiskPathRule[] {
  if (!isObj(v)) {
    errors.push(`${at} must be an object`);
    return [];
  }
  const before = errors.length;
  if (typeof v.glob !== 'string' || !v.glob.trim()) errors.push(`${at}.glob must be a non-empty path glob`);
  if (!isRiskLevel(v.level)) errors.push(`${at}.level must be one of ${LEVELS}`);
  if (v.category !== undefined && !isRiskCategory(v.category)) errors.push(`${at}.category is not a known category`);
  const unknown = Object.keys(v).filter((k) => !RULE_KEYS.includes(k));
  if (unknown.length) errors.push(`${at}: unknown ${unknown.join(', ')}`);
  if (errors.length > before) return [];
  const category = isRiskCategory(v.category) ? { category: v.category } : {};
  return [{ glob: (v.glob as string).trim(), level: v.level as RiskPathRule['level'], ...category }];
}

/** The file as written by the Lookout: stable key order, two-space indent, trailing newline. */
export function serializePolicy(p: RiskPolicy): string {
  const paths = p.paths.map((r) => ({ glob: r.glob, level: r.level, ...(r.category ? { category: r.category } : {}) }));
  return `${JSON.stringify({ v: 1, categories: p.categories, paths }, null, 2)}\n`;
}
