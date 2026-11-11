import { LOCK_SIG, readLookoutLock } from '../agents/lookoutLock';
import { announcementSigned } from '../machine/announcementSigned';
import { isLoopbackLookoutUrl } from '../projects/elsewhereUrl';

export type RunningLookout =
  { kind: 'running'; url: string } | { kind: 'none' } | { kind: 'other-folder' } | { kind: 'unsigned' };

/**
 * The Lookout serving this tracker folder, for `teamtrail pair`: its URL only when the lock names a Lookout on
 * this machine (plain http on loopback) and carries this machine's signature. Any local process can write the lock,
 * and a pairing link sent to a server an agent runs would hand it the code. `other-folder`: a Lookout started in
 * another folder has this one open as one of its projects, and signs browsers in with its own codes.
 */
export function runningLookout(root: string): RunningLookout {
  const lock = readLookoutLock(root);
  if (!lock) return { kind: 'none' };
  const signed = announcementSigned(root, LOCK_SIG, [lock.url, lock.pid, lock.startedAt], lock.sig);
  if (!signed || !isLoopbackLookoutUrl(lock.url)) return { kind: 'unsigned' };
  if (lock.url.includes('?project=')) return { kind: 'other-folder' };
  return { kind: 'running', url: lock.url };
}
