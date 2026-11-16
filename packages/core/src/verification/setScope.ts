import { existsSync } from 'node:fs';
import path from 'node:path';
import type { VerificationConfig } from '../model/verification';
import { OperationError } from '../planning/operations/operationError';
import { checksApproval } from './checksApproval';
import { VERIFICATION_FILE } from './configFile';
import { readRawConfig } from './rawConfig';
import { StaleChecks } from './setChecks';
import { writeApprovedConfig } from './writeApprovedConfig';

export type ScopePolicy = VerificationConfig['scope'];

const POLICIES: ScopePolicy[] = ['flag', 'fail', 'human'];

const LABEL: Record<ScopePolicy, string> = {
  flag: 'shown to the reviewer',
  fail: 'sent back for rework',
  human: 'decided by a person',
};

/**
 * The trail lead sets what a change outside the files an agent declared does (`scope` in verification.json), from
 * the Lookout, approved in the same step. Only over `base` (the file as they loaded it), and only while the file is
 * the one approved here: approving it must never approve check commands nobody looked at. Needs the file: without
 * one nothing is verified, so there is no scope to check. Journaled.
 */
export function setScope(o: { root: string; scope: unknown; base: string; by: string }) {
  if (!POLICIES.includes(o.scope as ScopePolicy)) throw new OperationError(`"scope" must be ${POLICIES.join(', ')}`);
  const scope = o.scope as ScopePolicy;
  const now = checksApproval(o.root);
  if (o.base !== now.hash) throw new StaleChecks(`${VERIFICATION_FILE} changed since you opened it; look again`);
  const file = path.join(o.root, VERIFICATION_FILE);
  if (!existsSync(file)) throw new OperationError('Set the checks first: without them nothing is verified');
  if (now.waiting)
    throw new OperationError(`Approve ${VERIFICATION_FILE} first: it changed since it was approved here`);
  const raw = readRawConfig(file, { v: 1 });
  const text = `${JSON.stringify({ ...raw, scope }, null, 2)}\n`;
  return writeApprovedConfig({
    root: o.root,
    text,
    by: o.by,
    subject: `changes outside the declared files: ${LABEL[scope]}`,
  });
}
