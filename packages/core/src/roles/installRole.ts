import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import type { RoleDoc, RoleLockEntry, RoleLockSource } from '../model/role';
import { OperationError } from '../planning/operations/operationError';
import { roleSha } from './roleHash';
import { lintRole } from './roleLint';
import { readRoleLock, writeRoleLock } from './roleLock';
import { pendingChecks } from './roleStatus';
import { roleFilePath, rolesDir } from './roleStore';

export interface Installed {
  role: RoleDoc;
  entry: RoleLockEntry;
  /** Proposed checks still waiting for the trail lead. */
  pendingChecks: string[];
  /** It replaced an installed version. */
  updated: boolean;
}

/** Why a role can't be installed: its lint errors, one per line. */
export function lintRefusal(text: string): string | undefined {
  const lint = lintRole(text);
  if (lint.ok) return undefined;
  const errors = lint.findings.filter((f) => f.level === 'error').map((f) => `line ${f.line}: ${f.message}`);
  return `This role can't be used:\n${errors.join('\n')}`;
}

/**
 * Writes a role file into `roles/` and pins it in `roles.lock.json`: its version, sha256, source and who added it.
 * Earlier check approvals stay on record, but a check whose argv changed needs approval again. Refuses a file that
 * fails the lint. `expectId` guards against a catalog entry that names a different role.
 */
export function installRole(input: {
  root: string;
  text: string;
  source: RoleLockSource;
  by: string;
  expectId?: string;
  now?: number;
}): Installed {
  const refusal = lintRefusal(input.text);
  if (refusal) throw new OperationError(refusal);
  const role = lintRole(input.text).role!;
  if (input.expectId && role.id !== input.expectId)
    throw new OperationError(`the file is role "${role.id}", not "${input.expectId}"`);
  mkdirSync(rolesDir(input.root), { recursive: true });
  writeFileSync(roleFilePath(input.root, role.id), input.text);
  const lock = readRoleLock(input.root);
  const prev = lock.roles[role.id];
  // what the trail lead approved before stays on record; a check whose argv changed is pending again (roleStatus.ts)
  const kept = Object.entries(prev?.approvedChecks ?? {}).filter(([n]) => n in role.proposedChecks);
  const entry: RoleLockEntry = {
    version: role.version,
    sha256: roleSha(input.text),
    source: input.source,
    addedAt: new Date(input.now ?? Date.now()).toISOString(),
    addedBy: input.by,
    approvedChecks: Object.fromEntries(kept),
    requiresChecks: role.requiresChecks,
  };
  lock.roles[role.id] = entry;
  writeRoleLock(input.root, lock);
  return { role, entry, pendingChecks: pendingChecks(role, entry), updated: !!prev };
}

/** The trail lead approves the role file as it is now (a hand-written role, or one edited after approval). */
export function approveRole(input: { root: string; id: string; by: string; now?: number }): Installed {
  let text: string;
  try {
    text = readFileSync(roleFilePath(input.root, input.id), 'utf8');
  } catch {
    throw new OperationError(`no role file ${input.id}.md to approve`);
  }
  const prev = readRoleLock(input.root).roles[input.id];
  return installRole({ ...input, text, source: prev?.source ?? 'local', expectId: input.id });
}
