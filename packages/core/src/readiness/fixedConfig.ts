import { checkArgv, checkNotice } from '../guides/checkArgv';
import { setupProblem } from '../guides/setupArgv';
import type { ReadinessCheck, ReadinessFix } from '../model/readiness';
import { OperationError } from '../planning/operations/operationError';
import { checkFolder } from '../verification/checkFolder';
import type { RawConfig } from '../verification/rawConfig';

const NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;
const MAX_CHECKS = 10;
type Obj = Record<string, Record<string, unknown>>;

/** The parts of verification.json the fixes change, as JSON: checks, the run order, setup steps. */
export interface FixedConfig {
  raw: RawConfig;
  checks: Obj;
  run: string[];
  setup: Obj;
  /** Setup steps added: shown to the person, approved in this step. */
  addedSetup: string[];
  /** What was done, for the journal. */
  done: string[];
  /** A check added that isn't a known shape: the person must have acknowledged it. */
  unknown: string[];
}

const spec = (run: string[], cwd: string) => ({ run, ...(cwd ? { cwd } : {}) });

function addCheck(c: FixedConfig, check: ReadinessCheck) {
  if (!NAME.test(check.name)) throw new OperationError(`"${check.name}": a name of lowercase letters, digits and dashes`);
  if (Object.hasOwn(c.checks, check.name)) throw new OperationError(`a check named ${check.name} already exists`);
  if (checkFolder(check.cwd) === undefined) throw new OperationError(`${check.name}: a folder inside the repository`);
  const unsafe = checkArgv({ run: check.run });
  if (unsafe.length) throw new OperationError(`${check.name} ${unsafe.join('; ')}`);
  if (checkNotice({ run: check.run })) c.unknown.push(check.name);
  c.checks[check.name] = spec(check.run, check.cwd);
  c.run.push(check.name);
  c.done.push(`added the check ${check.name}`);
}

function setFolder(c: FixedConfig, fix: Extract<ReadinessFix, { kind: 'set-folder' }>) {
  const was = c.checks[fix.check];
  if (!was) throw new OperationError(`there is no check named ${fix.check}`);
  const { cwd: _cwd, ...rest } = was;
  c.checks[fix.check] = { ...rest, ...(fix.cwd ? { cwd: fix.cwd } : {}) };
  c.done.push(`${fix.check} runs in ${fix.cwd || 'the top'}`);
}

function addSetup(c: FixedConfig, fix: Extract<ReadinessFix, { kind: 'add-setup' }>) {
  if (!NAME.test(fix.name) || Object.hasOwn(c.setup, fix.name))
    throw new OperationError(`a setup step named ${fix.name} already exists`);
  const problem = setupProblem({ run: fix.run, cwd: fix.cwd });
  if (problem) throw new OperationError(`${fix.run.join(' ')} ${problem}`);
  c.setup[fix.name] = spec(fix.run, fix.cwd);
  c.addedSetup.push(fix.name);
  c.done.push(`added the setup step ${fix.name}`);
}

/** `fix` applied to `c`, or refused: names taken, argv the check lint refuses, a setup step that isn't a frozen install. */
export function applyFix(c: FixedConfig, fix: ReadinessFix): void {
  switch (fix.kind) {
    case 'add-checks':
      for (const check of fix.checks) addCheck(c, check);
      if (c.run.length > MAX_CHECKS) throw new OperationError(`at most ${MAX_CHECKS} checks`);
      return;
    case 'set-folder':
      return setFolder(c, fix);
    case 'add-setup':
      return addSetup(c, fix);
    default: {
      const never: never = fix;
      return never;
    }
  }
}
