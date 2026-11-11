import { randomBytes } from 'node:crypto';
import { LOCK_SIG, readLookoutLock } from '../agents/lookoutLock';
import { announcementSigned } from '../machine/announcementSigned';
import { BRAND } from '../model/brand';
import { isLoopbackLookoutUrl } from '../projects/elsewhereUrl';
import { instanceProven } from './instanceProof';

export type RunningLookout =
  | { kind: 'running'; url: string; instance: number }
  | { kind: 'none' }
  | { kind: 'other-folder' }
  | { kind: 'unsigned' }
  | { kind: 'not-answering' };

/** Whether the server at `url` proves it is Lookout process `pid` of this machine, for a fresh nonce. */
async function provesInstance(root: string, at: { url: string; pid: number }, fetcher: typeof fetch) {
  const nonce = randomBytes(16).toString('hex');
  try {
    const res = await fetcher(new URL(`${BRAND.apiPrefix}/session?nonce=${nonce}`, at.url), {
      signal: AbortSignal.timeout(2000),
      redirect: 'error',
    });
    const body = (await res.json()) as { instance?: unknown; proof?: unknown };
    return res.ok && body.instance === at.pid && instanceProven(root, at.pid, nonce, body.proof);
  } catch {
    return false;
  }
}

/**
 * The Lookout serving this tracker folder, for `teamtrail pair`. Any local process can write the lock, and a
 * pairing link sent to a server an agent runs would hand it the code, so the URL is used only when:
 * - the lock's process is alive, the lock carries this machine's signature, and its URL is plain http on loopback;
 * - the server there signs a fresh nonce with the machine key for that very process (`GET /session?nonce=`): an
 *   old signed lock replayed after the Lookout exited, with an agent's server on its port, fails here.
 * Codes are made for that process alone (`instance`), so even one that reached another server opens nothing.
 * `other-folder`: a Lookout started in another folder has this one open as one of its projects.
 */
export async function runningLookout(root: string, fetcher: typeof fetch = fetch): Promise<RunningLookout> {
  const lock = readLookoutLock(root);
  if (!lock) return { kind: 'none' };
  const signed = announcementSigned(root, LOCK_SIG, [lock.url, lock.pid, lock.startedAt], lock.sig);
  if (!signed || !isLoopbackLookoutUrl(lock.url)) return { kind: 'unsigned' };
  if (lock.url.includes('?project=')) return { kind: 'other-folder' };
  if (!(await provesInstance(root, lock, fetcher))) return { kind: 'not-answering' };
  return { kind: 'running', url: lock.url, instance: lock.pid };
}
