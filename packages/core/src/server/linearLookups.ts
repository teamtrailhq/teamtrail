import { describeError } from '../adapters/remote/describeError';
import { linearViewer } from '../adapters/remote/linear/linearViewer';
import { listLinearProjects } from '../adapters/remote/linear/listLinearProjects';
import { listLinearTeams } from '../adapters/remote/linear/listLinearTeams';
import type {
  CredentialSource,
  LinearLookupRequest,
  LinearProjectList,
  LinearTeamList,
  LinearViewer,
} from '../adapters/remote/types';
import { resolveLinearKey } from './trackerConfig';
import type { TrackerContext } from './trackerContext';

const VIEWER_MS = 5 * 60_000;
const LIST_MS = 60_000;
/** A failed lookup is retried sooner: the network or the key may be back. */
const FAILED_MS = 15_000;
/** Lookups kept at once: the found key, a pasted one, a few teams' projects. */
const MAX_ENTRIES = 16;

interface Cached<T> {
  at: number;
  ttl: number;
  value: Promise<T>;
}

/** A small per-key cache: entries expire after their ttl, a failure after `FAILED_MS`. */
function cache() {
  const entries = new Map<string, Cached<unknown>>();
  return {
    get<T>(id: string, ttl: number, load: () => Promise<T>, failed: (v: T) => boolean): Promise<T> {
      const hit = entries.get(id) as Cached<T> | undefined;
      if (hit && Date.now() - hit.at < hit.ttl) return hit.value;
      const c: Cached<T> = { at: Date.now(), ttl, value: load() };
      entries.delete(id);
      entries.set(id, c);
      if (entries.size > MAX_ENTRIES) entries.delete(entries.keys().next().value!);
      void c.value.then((v) => {
        if (failed(v)) c.ttl = FAILED_MS;
      });
      return c.value;
    },
    clear: () => entries.clear(),
  };
}

/**
 * Who a Linear key belongs to, the teams it can access and a team's projects, each cached briefly per key so the
 * Settings poll and the pickers don't spend the rate limit. The key is the found one (env or saved) unless the page
 * sent one it was pasted into. Keys stay in this process; results carry none.
 */
export function linearLookups(ctx: TrackerContext) {
  const memo = cache();
  const http = { apiUrl: ctx.apiUrl.linear, fetch: ctx.o.fetch };

  function keyFor(req: LinearLookupRequest): { token: string; source: CredentialSource | null } | null {
    const pasted = req.apiKey?.trim();
    if (pasted) return { token: pasted, source: null };
    return resolveLinearKey(ctx.creds.read(), ctx.env);
  }

  function viewerFor(apiKey: string): Promise<LinearViewer> {
    const load = () => linearViewer({ apiKey, ...http });
    return memo.get(`viewer:${apiKey}`, VIEWER_MS, load, (v) => v.kind !== 'user');
  }

  async function teamsFor(apiKey: string, auth: CredentialSource | null): Promise<LinearTeamList> {
    try {
      const [viewer, list] = await Promise.all([viewerFor(apiKey), listLinearTeams({ apiKey, ...http })]);
      return { kind: 'ok', viewer, auth, ...list };
    } catch (err) {
      const { error, code } = describeError(err, 'Linear');
      return { kind: 'error', auth, error: error ?? 'Linear could not list your teams', code };
    }
  }

  async function projectsFor(apiKey: string, teamId: string): Promise<LinearProjectList> {
    try {
      return { kind: 'ok', ...(await listLinearProjects({ apiKey, teamId, ...http })) };
    } catch (err) {
      const { error, code } = describeError(err, 'Linear');
      return { kind: 'error', error: error ?? 'Linear could not list the projects of this team', code };
    }
  }

  return {
    /** The user behind the found key, or undefined when there is none. */
    async viewer(): Promise<LinearViewer | undefined> {
      const found = keyFor({});
      return found ? viewerFor(found.token) : undefined;
    },
    teams(req: LinearLookupRequest = {}): Promise<LinearTeamList> {
      const found = keyFor(req);
      if (!found) return Promise.resolve({ kind: 'no-key' });
      const load = () => teamsFor(found.token, found.source);
      return memo.get(`teams:${found.token}`, LIST_MS, load, (v) => v.kind !== 'ok');
    },
    projects(req: LinearLookupRequest & { teamId: string }): Promise<LinearProjectList> {
      const found = keyFor(req);
      if (!found) return Promise.resolve({ kind: 'no-key' });
      const load = () => projectsFor(found.token, req.teamId);
      return memo.get(`projects:${found.token}:${req.teamId}`, LIST_MS, load, (v) => v.kind !== 'ok');
    },
    /** A key was saved or forgotten: look again. */
    reset: memo.clear,
  };
}

export type LinearLookups = ReturnType<typeof linearLookups>;
