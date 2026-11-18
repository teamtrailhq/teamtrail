import type { DiffRule } from '../model/diffRule';
import { hasControl } from '../model/safeText';
import type { CheckSpec } from '../model/verification';

export const MAX_RULES = 50;
export const MAX_RULE_GLOBS = 20;
export const MAX_RULE_TEXT = 300;
const MAX_GLOB = 200;
const ID = /^R-\d{1,4}$/;
const KEYS = ['id', 'when', 'check', 'ask', 'why'];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);

/** One line of text, at most `max` characters, not blank: the shape of a rule's question and reason. */
const line = (v: unknown, max = MAX_RULE_TEXT): v is string =>
  typeof v === 'string' && !!v.trim() && v.length <= max && !hasControl(v);

/** A repo-relative path glob: no absolute path, no `..`, no backslashes. */
function globProblem(g: unknown): string | undefined {
  if (!line(g, MAX_GLOB)) return `must be a path glob of at most ${MAX_GLOB} characters`;
  if (g.startsWith('/') || /^[a-zA-Z]:/.test(g)) return 'must be relative to the repo';
  if (g.includes('\\')) return 'must use / between folders';
  if (g.split('/').includes('..')) return 'must stay inside the repo';
  return undefined;
}

function whenOf(v: unknown, at: string, errors: string[]): string[] | undefined {
  if (!Array.isArray(v) || !v.length || v.length > MAX_RULE_GLOBS)
    return void errors.push(`${at}.when must list 1–${MAX_RULE_GLOBS} path globs`);
  const problems = v.flatMap((g, i) => {
    const p = globProblem(g);
    return p ? [`${at}.when[${i}] ${p}`] : [];
  });
  errors.push(...problems);
  return problems.length ? undefined : (v as string[]).map((g) => g.replace(/^\.\//, ''));
}

/** The optional text fields: `check` names an approved check, `ask` is one line; at least one of them. */
function actions(r: Obj, at: string, ctx: { checks: Record<string, CheckSpec>; errors: string[] }) {
  const { errors } = ctx;
  if (r.check === undefined && r.ask === undefined) errors.push(`${at} needs a "check" to run or a question to "ask"`);
  if (r.check !== undefined && (typeof r.check !== 'string' || !ctx.checks[r.check]))
    errors.push(`${at}.check must name a check in "checks"`);
  if (r.ask !== undefined && !line(r.ask)) errors.push(`${at}.ask must be one line of at most ${MAX_RULE_TEXT}`);
  return {
    ...(typeof r.check === 'string' ? { check: r.check } : {}),
    ...(typeof r.ask === 'string' ? { ask: r.ask.trim() } : {}),
  };
}

function ruleOf(r: unknown, i: number, ctx: { checks: Record<string, CheckSpec>; errors: string[] }) {
  const at = `rules[${i}]`;
  const { errors } = ctx;
  if (!isObj(r)) return void errors.push(`${at} must be an object`);
  const unknown = Object.keys(r).filter((k) => !KEYS.includes(k));
  if (unknown.length) errors.push(`${at}: unknown ${unknown.join(', ')}`);
  if (typeof r.id !== 'string' || !ID.test(r.id)) errors.push(`${at}.id must be R-<number>`);
  const when = whenOf(r.when, at, errors);
  const acts = actions(r, at, ctx);
  if (!line(r.why)) errors.push(`${at}.why must say, in one line of at most ${MAX_RULE_TEXT}, why the rule exists`);
  if (!when || typeof r.id !== 'string' || !line(r.why)) return undefined;
  const rule: DiffRule = { id: r.id, when, ...acts, why: r.why.trim() };
  return rule;
}

/**
 * verification.json's `rules`: each an id, the globs that trigger it, a check to run and/or a question to ask, and
 * why. Every problem goes to `errors` (the file then has errors, and nothing it asks for changes until fixed).
 */
export function parseRules(v: unknown, checks: Record<string, CheckSpec>, errors: string[]): DiffRule[] {
  if (!Array.isArray(v)) return (errors.push('"rules" must be a list of rules'), []);
  if (v.length > MAX_RULES) errors.push(`"rules" may hold at most ${MAX_RULES} rules`);
  const rules = v.map((r, i) => ruleOf(r, i, { checks, errors })).filter((r): r is DiffRule => !!r);
  const seen = new Set<string>();
  for (const r of rules) {
    if (seen.has(r.id)) errors.push(`"rules" names ${r.id} twice`);
    seen.add(r.id);
  }
  return rules;
}
