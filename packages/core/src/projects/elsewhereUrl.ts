import path from 'node:path';
import { agentPaths, type LookoutLock } from '../agents/agentLink';
import { LOCK_SIG } from '../agents/lookoutLock';
import { readJsonFile } from '../lib/jsonFile';
import { announcementSigned } from '../machine/announcementSigned';
import { BRAND } from '../model/brand';
import type { ProjectState } from '../model/project';
import { projectId } from './projectId';

// 127.0.0.1 only, the address a Lookout writes and holds: `localhost` may resolve to `::1` first, and another
// 127.x address is a socket another program could hold.
const LOOPBACK = /^http:\/\/127\.0\.0\.1:\d{1,5}\/(\?project=[\w-]{1,64})?$/;
const TTL_MS = 30_000;
const known = new Map<string, { at: number; ok: boolean }>();

/** A lock's URL as a Lookout writes it: plain http on 127.0.0.1, its root path, maybe `?project=<id>`. */
export const isLoopbackLookoutUrl = (url: unknown): url is string => typeof url === 'string' && LOOPBACK.test(url);

/**
 * Whether `url` answers as a Teamtrail serving `root`: its sign-in status (the one route that needs no session)
 * names that same folder's project id.
 */
async function answersFor(url: string, root: string, fetcher: typeof fetch) {
  try {
    const res = await fetcher(new URL(`${BRAND.apiPrefix}/session`, url), {
      signal: AbortSignal.timeout(1500),
      redirect: 'error',
    });
    const body = (await res.json()) as { project?: unknown };
    return res.ok && body.project === projectId(root);
  } catch {
    return false;
  }
}

/** The lock in the folder names `url` and carries this machine's signature of it. */
function signedLock(root: string, url: string) {
  const lock = readJsonFile<LookoutLock>(path.join(root, agentPaths.lock));
  return (
    !!lock && lock.url === url && announcementSigned(root, LOCK_SIG, [lock.url, lock.pid, lock.startedAt], lock.sig)
  );
}

/**
 * The state with its URL only when that URL can be believed. `.agents/server.json` is a file any local process
 * can write: the project stays closed here either way (one root, one reconciler), but the link to "the Lookout
 * that serves it" is offered only for a loopback URL that answers as a Teamtrail for this very folder. Answers
 * are remembered for half a minute, so the overview's polling doesn't ask every time.
 * The lock must also be signed with this machine's key (agents/lookoutLock.ts): only a Teamtrail of this machine
 * wrote it, not just any process that knows the URL of one.
 */
export async function verifiedElsewhere(
  root: string,
  state: ProjectState,
  fetcher: typeof fetch = fetch,
): Promise<ProjectState> {
  if (state.kind !== 'elsewhere' || state.url === undefined) return state;
  const { url } = state;
  const key = `${root}\n${url}`;
  const cached = known.get(key);
  const fresh = cached && Date.now() - cached.at < TTL_MS;
  const ok =
    isLoopbackLookoutUrl(url) && signedLock(root, url) && (fresh ? cached.ok : await answersFor(url, root, fetcher));
  if (!fresh) known.set(key, { at: Date.now(), ok });
  return ok ? state : { kind: 'elsewhere' };
}
