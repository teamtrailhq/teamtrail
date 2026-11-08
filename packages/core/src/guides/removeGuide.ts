import { rmSync } from 'node:fs';
import { OperationError } from '../planning/operations/operationError';
import { BUILTIN_GUIDES } from './builtin/builtinGuides';
import { readGuideLock, writeGuideLock } from './guideLock';
import { guideFilePath } from './guideStore';

/**
 * Removes an installed guide: its file and its lock entry. Checks it had approved stay in verification.json, which is
 * the trail lead's to edit. Removing an override brings the built-in guide back; built-in guides themselves stay.
 */
export function removeGuide(input: { root: string; id: string }) {
  const lock = readGuideLock(input.root);
  const file = guideFilePath(input.root, input.id);
  const pinned = input.id in lock.guides;
  let had = false;
  try {
    rmSync(file);
    had = true;
  } catch {
    // no file: only the lock entry, if any
  }
  if (!had && !pinned) {
    const why = input.id in BUILTIN_GUIDES ? 'is built in and stays' : 'is not installed';
    throw new OperationError(`guide ${input.id} ${why}`);
  }
  delete lock.guides[input.id];
  writeGuideLock(input.root, lock, input.id);
  return { removed: input.id, builtinBack: input.id in BUILTIN_GUIDES };
}
