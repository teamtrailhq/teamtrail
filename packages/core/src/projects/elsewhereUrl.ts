import { realpathSync } from 'node:fs';
import { BRAND } from '../model/brand';
import type { ProjectState } from '../model/project';

const LOOPBACK = /^http:\/\/(localhost|127\.\d+\.\d+\.\d+|\[::1\]):\d{1,5}\/(\?project=[\w-]{1,64})?$/;
const TTL_MS = 30_000;
const known = new Map<string, { at: number; ok: boolean }>();

/** A lock's URL as a Lookout writes it: plain http on this machine, its root path, maybe `?project=<id>`. */
export const isLoopbackLookoutUrl = (url: unknown): url is string => typeof url === 'string' && LOOPBACK.test(url);

const real = (p: string) => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};

/** Whether `url` answers as a Teamtrail serving `root`: its file list names that same folder. */
async function answersFor(url: string, root: string, fetcher: typeof fetch) {
  try {
    const res = await fetcher(new URL(`${BRAND.apiPrefix}/list`, url), {
      signal: AbortSignal.timeout(1500),
      redirect: 'error',
    });
    const body = (await res.json()) as { root?: unknown };
    return res.ok && typeof body.root === 'string' && real(body.root) === real(root);
  } catch {
    return false;
  }
}

/**
 * The state with its URL only when that URL can be believed. `.agents/server.json` is a file any local process
 * can write: the project stays closed here either way (one root, one reconciler), but the link to "the Lookout
 * that serves it" is offered only for a loopback URL that answers as a Teamtrail for this very folder. Answers
 * are remembered for half a minute, so the overview's polling doesn't ask every time.
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
  const ok = isLoopbackLookoutUrl(url) && (fresh ? cached.ok : await answersFor(url, root, fetcher));
  if (!fresh) known.set(key, { at: Date.now(), ok });
  return ok ? state : { kind: 'elsewhere' };
}
