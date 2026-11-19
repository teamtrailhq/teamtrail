import type { SetupSpec } from '../model/setup';

/** A setup step gets this long unless it says otherwise: installs can be slow. */
export const DEFAULT_SETUP_TIMEOUT_SEC = 900;
/** At most this many steps: one per install root of a monorepo. */
export const MAX_SETUP_STEPS = 10;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
const ARG = (a: unknown) => typeof a === 'string' && a.length > 0 && a.length <= 300 && !/[\0\r\n]/.test(a);

function step(name: string, v: unknown, errors: string[]): SetupSpec | undefined {
  const at = `setup.${name}`;
  if (!NAME.test(name)) return void errors.push(`${at}: a name of lowercase letters, digits and dashes`);
  if (!isObj(v)) return void errors.push(`${at} must be an object`);
  if (typeof v.run === 'string') return void errors.push(`${at}.run must be an argv array, not a shell string`);
  if (!Array.isArray(v.run) || !v.run.length || v.run.length > 30 || !v.run.every(ARG))
    return void errors.push(`${at}.run must be a non-empty array of up to 30 strings`);
  const timeout = v.timeoutSec;
  if (timeout !== undefined && !(typeof timeout === 'number' && Number.isInteger(timeout) && timeout > 0))
    errors.push(`${at}.timeoutSec must be a positive integer`);
  if (v.cwd !== undefined && typeof v.cwd !== 'string') errors.push(`${at}.cwd must be a path`);
  const unknown = Object.keys(v).filter((k) => !['run', 'cwd', 'timeoutSec'].includes(k));
  if (unknown.length) errors.push(`${at}: unknown ${unknown.join(', ')}`);
  return {
    run: v.run as string[],
    timeoutSec: typeof timeout === 'number' ? timeout : DEFAULT_SETUP_TIMEOUT_SEC,
    ...(typeof v.cwd === 'string' ? { cwd: v.cwd } : {}),
  };
}

/**
 * `setup` in verification.json: named steps, run in the order written. Only the shape is checked here; which
 * commands Teamtrail will actually run is setupArgv.ts's call, made again where they run.
 */
export function parseSetup(v: unknown, errors: string[]): Record<string, SetupSpec> | undefined {
  if (v === undefined) return undefined;
  if (!isObj(v)) return void errors.push('"setup" must be an object of named steps');
  const entries = Object.entries(v);
  if (entries.length > MAX_SETUP_STEPS) errors.push(`"setup" may name at most ${MAX_SETUP_STEPS} steps`);
  const out: Record<string, SetupSpec> = {};
  for (const [name, spec] of entries) {
    const s = step(name, spec, errors);
    if (s) out[name] = s;
  }
  return out;
}
