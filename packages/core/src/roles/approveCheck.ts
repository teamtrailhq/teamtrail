import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ProposedCheck } from '../model/role';
import { OperationError } from '../planning/operations/operationError';
import { parseVerificationConfig } from '../verification/config';
import { VERIFICATION_FILE } from '../verification/configFile';
import { checkSha } from './roleHash';
import { argvProblems } from './roleLint';
import { readRoleLock, writeRoleLock } from './roleLock';
import { listRoles } from './roleStore';

type Raw = { checks?: Record<string, unknown> } & Record<string, unknown>;

/** verification.json as JSON; a new file starts with verification off, so approving a check never turns it on. */
function readRaw(file: string): Raw {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return { v: 1, default: 'off', checks: {} };
  }
  try {
    return JSON.parse(text) as Raw;
  } catch {
    throw new OperationError(`${VERIFICATION_FILE} is not valid JSON; fix it first`);
  }
}

const specOf = (p: ProposedCheck) => ({
  run: p.run,
  ...(p.timeoutSec ? { timeoutSec: p.timeoutSec } : {}),
  ...(p.cwd ? { cwd: p.cwd } : {}),
});

/**
 * The trail lead approves one check a role proposes: it is written to verification.json (the only place Teamtrail
 * runs commands from) and its argv hash to the lock. Refuses when the role isn't active, the argv is unsafe, or
 * verification.json already has a different check of that name.
 */
export function approveCheck(input: { root: string; id: string; name: string }) {
  const r = listRoles(input.root).find((x) => x.id === input.id);
  if (!r || r.status !== 'active' || !r.role || r.origin !== 'local')
    throw new OperationError(`approve role ${input.id} before its checks`);
  const proposed = r.role.proposedChecks[input.name];
  if (!proposed) throw new OperationError(`${input.id} proposes no check "${input.name}"`);
  const unsafe = argvProblems(proposed);
  if (unsafe.length) throw new OperationError(`check ${input.name} ${unsafe.join('; ')}`);
  const file = path.join(input.root, VERIFICATION_FILE);
  const raw = readRaw(file);
  const checks = { ...(raw.checks ?? {}) };
  const spec = specOf(proposed);
  const existing = checks[input.name];
  const lock = readRoleLock(input.root);
  // the trail lead may replace a check an earlier version of this role had them approve
  const ours = !!existing && lock.roles[input.id].approvedChecks[input.name] === checkSha(existing as ProposedCheck);
  if (existing && !ours && JSON.stringify(existing) !== JSON.stringify(spec))
    throw new OperationError(
      `${VERIFICATION_FILE} already has a different "${input.name}" check; rename it there or edit it by hand`,
    );
  const next = { ...raw, checks: { ...checks, [input.name]: spec } };
  const text = `${JSON.stringify(next, null, 2)}\n`;
  const { errors } = parseVerificationConfig(text);
  if (errors.length) throw new OperationError(`${VERIFICATION_FILE} would be invalid: ${errors.join('; ')}`);
  writeFileSync(file, text);
  lock.roles[input.id].approvedChecks[input.name] = checkSha(proposed);
  writeRoleLock(input.root, lock, input.id);
  return { check: input.name, run: proposed.run, version: r.role.version };
}
