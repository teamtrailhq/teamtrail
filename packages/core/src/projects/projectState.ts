import { existsSync } from 'node:fs';
import { readLookoutLock } from '../agents/lookoutLock';
import type { ProjectState } from '../model/project';

/**
 * Whether a project can be opened here: its folder exists, and no other live `teamtrail` serves it. Two
 * processes never run reconcilers or lease reapers for the same root, so one held elsewhere is only read.
 */
export function projectState(root: string, pid = process.pid): ProjectState {
  if (!existsSync(root)) return { kind: 'missing' };
  const lock = readLookoutLock(root);
  if (lock && lock.pid !== pid) return { kind: 'elsewhere', url: lock.url };
  return { kind: 'ok' };
}
