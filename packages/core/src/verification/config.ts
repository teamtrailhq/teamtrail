import { VERIFICATION_LEVELS } from '../model/lifecycle';
import { TICKET_TYPES, type TicketType } from '../model/types';
import type { CheckSpec, VerificationConfig } from '../model/verification';

export const DEFAULT_CHECK_TIMEOUT_SEC = 600;

/** Values for keys the file leaves out. Without the file there is no config, and nothing is verified. */
export const DEFAULT_CONFIG: VerificationConfig = {
  v: 1,
  default: 'checks',
  appliesTo: ['execute', 'task'],
  checks: {},
  run: [],
  failFast: true,
  maxAttempts: 3,
  totalTimeoutSec: 1800,
  noChanges: { allow: ['research', 'junction', 'prototype'], else: 'flag' },
  stale: 'reverify',
  github: { enabled: 'auto', requiredChecks: [], pollSec: 60 },
};

const KEYS = new Set(Object.keys(DEFAULT_CONFIG));
type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const strings = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string');
const posInt = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v > 0;

function types(v: unknown, at: string, errors: string[]): TicketType[] | undefined {
  if (!strings(v) || !(v as string[]).every((t) => (TICKET_TYPES as string[]).includes(t))) {
    errors.push(`${at} must list ticket types (${TICKET_TYPES.join(', ')})`);
    return undefined;
  }
  return v as TicketType[];
}

/** One named check as verification.json (or a role's proposed check) writes it; problems go to `errors`. */
export function parseCheckSpec(name: string, v: unknown, errors: string[]): CheckSpec | undefined {
  const at = `checks.${name}`;
  if (!isObj(v)) return void errors.push(`${at} must be an object`);
  if (typeof v.run === 'string') return void errors.push(`${at}.run must be an argv array, not a shell string`);
  if (!strings(v.run) || !(v.run as string[]).length || !(v.run as string[])[0])
    return void errors.push(`${at}.run must be a non-empty array of strings`);
  if (v.timeoutSec !== undefined && !posInt(v.timeoutSec)) errors.push(`${at}.timeoutSec must be a positive integer`);
  if (v.cwd !== undefined && typeof v.cwd !== 'string') errors.push(`${at}.cwd must be a path`);
  const unknown = Object.keys(v).filter((k) => !['run', 'timeoutSec', 'cwd'].includes(k));
  if (unknown.length) errors.push(`${at}: unknown ${unknown.join(', ')}`);
  return {
    run: v.run as string[],
    timeoutSec: (v.timeoutSec as number) ?? DEFAULT_CHECK_TIMEOUT_SEC,
    ...(typeof v.cwd === 'string' ? { cwd: v.cwd } : {}),
  };
}

type Take = <T>(v: unknown, valid: (v: unknown) => v is T, set: (v: T) => void, error: string) => void;

/** Sets a field when the file has it and it's valid; reports it when it's invalid. */
const taker =
  (errors: string[]): Take =>
  (v, valid, set, error) => {
    if (v === undefined) return;
    if (valid(v)) set(v);
    else errors.push(error);
  };

const oneOf =
  <T extends string>(...values: readonly T[]) =>
  (v: unknown): v is T =>
    values.includes(v as T);
const isStrings = (v: unknown): v is string[] => strings(v);
const isPosInt = (v: unknown): v is number => posInt(v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

function parseJson(text: string): { raw: Obj } | { errors: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { errors: [`not valid JSON: ${(e as Error).message}`] };
  }
  return isObj(raw) ? { raw } : { errors: ['must be a JSON object'] };
}

/** Parses `verification.json`; every problem is reported, and `config` is only set when there are none. */
export function parseVerificationConfig(text: string): { config?: VerificationConfig; errors: string[] } {
  const parsed = parseJson(text);
  if ('errors' in parsed) return parsed;
  const { raw } = parsed;
  const errors: string[] = [];
  const take = taker(errors);
  const c: VerificationConfig = structuredClone(DEFAULT_CONFIG);
  if (raw.v !== 1) errors.push('"v" must be 1');
  for (const k of Object.keys(raw)) if (!KEYS.has(k)) errors.push(`unknown key "${k}"`);
  const levels = `"default" must be one of ${VERIFICATION_LEVELS.join(', ')}`;
  take(raw.default, oneOf(...VERIFICATION_LEVELS), (v) => (c.default = v), levels);
  if (raw.appliesTo !== undefined) c.appliesTo = types(raw.appliesTo, '"appliesTo"', errors) ?? c.appliesTo;
  parseChecks(raw.checks, c, errors);
  take(raw.run, isStrings, (v) => (c.run = v), '"run" must list check names');
  for (const name of c.run) if (!c.checks[name]) errors.push(`"run" names unknown check "${name}"`);
  take(raw.failFast, isBool, (v) => (c.failFast = v), '"failFast" must be true or false');
  for (const k of ['maxAttempts', 'totalTimeoutSec'] as const)
    take(raw[k], isPosInt, (v) => (c[k] = v), `"${k}" must be a positive integer`);
  parseNoChanges(raw.noChanges, c, errors);
  take(raw.stale, oneOf('reverify', 'flag'), (v) => (c.stale = v), '"stale" must be reverify or flag');
  parseGithub(raw.github, c, errors);
  return errors.length ? { errors } : { config: c, errors };
}

function parseChecks(v: unknown, c: VerificationConfig, errors: string[]) {
  if (v === undefined) return;
  if (!isObj(v)) return void errors.push('"checks" must be an object of named checks');
  for (const [name, spec] of Object.entries(v)) {
    const s = parseCheckSpec(name, spec, errors);
    if (s) c.checks[name] = s;
  }
}

function parseNoChanges(n: unknown, c: VerificationConfig, errors: string[]) {
  if (n === undefined) return;
  if (!isObj(n)) return void errors.push('"noChanges" must be an object');
  if (n.allow !== undefined) c.noChanges.allow = types(n.allow, '"noChanges.allow"', errors) ?? c.noChanges.allow;
  const elseError = '"noChanges.else" must be flag, fail or human';
  taker(errors)(n.else, oneOf('flag', 'fail', 'human'), (v) => (c.noChanges.else = v), elseError);
}

function parseGithub(g: unknown, c: VerificationConfig, errors: string[]) {
  if (g === undefined) return;
  if (!isObj(g)) return void errors.push('"github" must be an object');
  const take = taker(errors);
  take(g.enabled, oneOf('auto', 'off'), (v) => (c.github.enabled = v), '"github.enabled" must be auto or off');
  take(
    g.requiredChecks,
    isStrings,
    (v) => (c.github.requiredChecks = v),
    '"github.requiredChecks" must list check names',
  );
  const isPoll = (v: unknown): v is number => posInt(v) && (v as number) >= 15;
  take(g.pollSec, isPoll, (v) => (c.github.pollSec = v), '"github.pollSec" must be an integer of at least 15');
}
