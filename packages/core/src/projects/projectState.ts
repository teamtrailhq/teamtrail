import { existsSync } from 'node:fs';
import { readLookoutLock } from '../agents/lookoutLock';
import type { ProjectState } from '../model/project';
import { isLoopbackLookoutUrl } from './elsewhereUrl';

/**
 * Whether a project can be opened here: its folder exists, and no other live `teamtrail` serves it. Two
 * processes never run reconcilers or lease reapers for the same root, so one held elsewhere is only read.
 */
export function projectState(root: string, pid = process.pid): ProjectState {
  if (!existsSync(root)) return { kind: 'missing' };
  const lock = readLookoutLock(root);
  if (lock && lock.pid !== pid)
    return isLoopbackLookoutUrl(lock.url) ? { kind: 'elsewhere', url: lock.url } : { kind: 'elsewhere' };
  return { kind: 'ok' };
}
