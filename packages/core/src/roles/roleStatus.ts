import type { InstalledRole, RoleDoc, RoleLockEntry } from '../model/role';
import { checkSha, roleSha } from './roleHash';
import { lintRole } from './roleLint';

/** Proposed checks of `role` the lock has no approval for at their current argv. */
export const pendingChecks = (role: RoleDoc, lock?: RoleLockEntry) =>
  Object.entries(role.proposedChecks)
    .filter(([name, spec]) => lock?.approvedChecks[name] !== checkSha(spec))
    .map(([name]) => name);

/**
 * One role file checked against the lock: invalid when it fails the lint or its id doesn't match the file name,
 * unapproved without a lock entry, tampered when it no longer matches the approved hash, else active.
 * Built-in roles ship with Teamtrail and need no lock entry.
 */
export function roleStatus(file: {
  id: string;
  origin: 'builtin' | 'local';
  text: string;
  lock?: RoleLockEntry;
  overridesBuiltin?: boolean;
}): InstalledRole {
  const lint = lintRole(file.text);
  const sha256 = roleSha(file.text);
  const base = {
    id: file.id,
    origin: file.origin,
    sha256,
    ...(lint.role ? { role: lint.role } : {}),
    ...(file.lock ? { lock: file.lock } : {}),
    findings: lint.findings,
    pendingChecks: lint.role && file.origin === 'local' ? pendingChecks(lint.role, file.lock) : [],
    overridesBuiltin: !!file.overridesBuiltin,
  };
  const firstError = lint.findings.find((f) => f.level === 'error');
  if (firstError) return { ...base, status: 'invalid', reason: `line ${firstError.line}: ${firstError.message}` };
  if (lint.role?.id !== file.id)
    return {
      ...base,
      status: 'invalid',
      reason: `its id "${lint.role?.id}" doesn't match the file name ${file.id}.md`,
    };
  if (file.origin === 'builtin') return { ...base, status: 'active' };
  if (!file.lock) return { ...base, status: 'unapproved', reason: 'not approved by the trail lead yet' };
  if (file.lock.sha256 !== sha256)
    return { ...base, status: 'tampered', reason: `changed since version ${file.lock.version} was approved` };
  return { ...base, status: 'active' };
}

/** A pinned role whose file is gone: still tampered, so its approved required checks keep applying. */
export const missingRole = (id: string, lock: RoleLockEntry): InstalledRole => ({
  id,
  origin: 'local',
  status: 'tampered',
  reason: `the file is missing (version ${lock.version} was approved)`,
  lock,
  findings: [],
  pendingChecks: [],
  overridesBuiltin: false,
});
