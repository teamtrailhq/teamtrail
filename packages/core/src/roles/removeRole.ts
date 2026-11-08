import { rmSync } from 'node:fs';
import { OperationError } from '../planning/operations/operationError';
import { BUILTIN_ROLES } from './builtin/builtinRoles';
import { readRoleLock, writeRoleLock } from './roleLock';
import { roleFilePath } from './roleStore';

/**
 * Removes an installed role: its file and its lock entry. Checks it had approved stay in verification.json, which is
 * the trail lead's to edit. Removing an override brings the built-in role back; built-in roles themselves stay.
 */
export function removeRole(input: { root: string; id: string }) {
  const lock = readRoleLock(input.root);
  const file = roleFilePath(input.root, input.id);
  const pinned = input.id in lock.roles;
  let had = false;
  try {
    rmSync(file);
    had = true;
  } catch {
    // no file: only the lock entry, if any
  }
  if (!had && !pinned) {
    const why = input.id in BUILTIN_ROLES ? 'is built in and stays' : 'is not installed';
    throw new OperationError(`role ${input.id} ${why}`);
  }
  delete lock.roles[input.id];
  writeRoleLock(input.root, lock, input.id);
  return { removed: input.id, builtinBack: input.id in BUILTIN_ROLES };
}
