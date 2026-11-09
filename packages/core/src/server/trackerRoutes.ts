import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TrackerAdapter } from '../adapters/adapter';
import type { RemoteKind, TrackerConnectRequest, TrackerTestRequest } from '../adapters/remote/types';
import { githubCiAccess } from './githubCiAccess';
import { githubLookups } from './githubLookups';
import { handleGitHubRepos } from './githubRepoRoutes';
import { BadRequest, readJson, sendJson } from './http';
import { isKind, remoteAdapters } from './remoteAdapters';
import { CALLS } from './trackerCalls';
import { trackerContext, type TrackerRoutesOptions } from './trackerContext';
import { crossSite, sendTrackerError } from './trackerErrors';
import { streamTrackerEvents } from './trackerEvents';
import { trackerSettings } from './trackerSettings';

export type { TrackerRoutesOptions } from './trackerContext';

/**
 * Tracker settings and the remote-tracker API. Credentials are read and
 * stored here, in the local process, and never sent to the browser:
 *   GET    /trackers                       TrackerSettings
 *   PUT    /trackers                       TrackerConnectRequest → TrackerSettings (tests the connection first)
 *   POST   /trackers/test                  TrackerTestRequest → TrackerTestResult
 *   GET    /trackers/github/repos          GitHubRepoList: repos the found token can track issues in, and its login
 *   DELETE /trackers/credentials/<kind>    forget the saved token / key
 *   POST   /tracker/<kind>/call            `{ method, args }` → `{ result }` (TrackerAdapter methods)
 *   GET    /tracker/<kind>/events          SSE: TrackerEvent per message; named `status` events (SyncStatus & { location })
 */
export function createTrackerRoutes(o: TrackerRoutesOptions) {
  const ctx = trackerContext(o);
  const remotes = remoteAdapters(ctx);
  const lookups = githubLookups(ctx);
  const { settings, test, connect } = trackerSettings(ctx, remotes, lookups);
  remotes.resumeQueued();

  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    const call = p.match(/^\/tracker\/([^/]+)\/(call|events)$/);
    const forget = p.match(/^\/trackers\/credentials\/([^/]+)$/);
    const repos = p === '/trackers/github/repos';
    if (p !== '/trackers' && p !== '/trackers/test' && !call && !forget && !repos) return false;
    try {
      if (crossSite(req)) return (void sendJson(res, 403, { error: 'cross-site request refused' }), true);
      if (repos) return await handleGitHubRepos(req, res, { path: p, lookups });
      const handled = call ? await remoteRoute(req, res, call) : await settingsRoute(req, res, p, forget);
      if (!handled) sendJson(res, 405, { error: 'method not allowed' });
    } catch (err) {
      if (err instanceof BadRequest) sendJson(res, 400, { error: err.message });
      else if (!sendTrackerError(res, err)) sendJson(res, 500, { error: String((err as Error)?.message ?? err) });
    }
    return true;
  }

  /** `/trackers`, `/trackers/test` and `/trackers/credentials/<kind>`. */
  async function settingsRoute(
    req: IncomingMessage,
    res: ServerResponse,
    p: string,
    forget: RegExpMatchArray | null,
  ): Promise<boolean> {
    if (p === '/trackers' && req.method === 'GET') return (void sendJson(res, 200, await settings()), true);
    if (p === '/trackers' && req.method === 'PUT') {
      const r = await connect(await readJson<TrackerConnectRequest>(req, '{}'));
      return (void sendJson(res, r.status, r.body), true);
    }
    if (p === '/trackers/test' && req.method === 'POST') {
      const b = await readJson<TrackerTestRequest>(req, '{}');
      if (!isKind(b.kind)) throw new BadRequest('"kind" must be github or linear');
      return (void sendJson(res, 200, await test(b)), true);
    }
    if (forget && req.method === 'DELETE') {
      forgetCredentials(forget[1]);
      return (void sendJson(res, 200, await settings()), true);
    }
    return false;
  }

  function forgetCredentials(kind: string) {
    if (!isKind(kind)) throw new BadRequest('unknown tracker');
    const c = ctx.creds.read();
    delete c[kind];
    ctx.creds.write(c);
    remotes.reset(kind);
    lookups.reset();
  }

  /** `/tracker/<kind>/events` and `/tracker/<kind>/call`. */
  async function remoteRoute(req: IncomingMessage, res: ServerResponse, match: RegExpMatchArray): Promise<boolean> {
    const [, kind, action] = match;
    if (!isKind(kind)) throw new BadRequest('unknown tracker');
    if (action === 'events' && req.method === 'GET')
      return (streamTrackerEvents(() => remotes.get(kind), req, res), true);
    if (action === 'call' && req.method === 'POST') {
      const result = await callAdapter(kind, await readJson<{ method?: string; args?: unknown[] }>(req, '{}'));
      return (void sendJson(res, 200, { result: result ?? null }), true);
    }
    return false;
  }

  async function callAdapter(kind: RemoteKind, b: { method?: string; args?: unknown[] }): Promise<unknown> {
    const method = b.method as keyof TrackerAdapter;
    if (!CALLS.has(method)) throw new BadRequest(`unknown method "${b.method}"`);
    const a = await remotes.get(kind);
    const fn = a[method] as (...args: unknown[]) => Promise<unknown>;
    return fn.apply(a, Array.isArray(b.args) ? b.args : []);
  }

  return {
    handle,
    /** The adapter the project is connected to, for routes shared with local markdown (decisions). */
    async active(): Promise<TrackerAdapter> {
      const a = ctx.project.read().active;
      return isKind(a) ? remotes.get(a) : o.markdown;
    },
    /** GitHub PR and CI reads for the reconciler, with the same token resolution as the tracker. */
    ciAccess: githubCiAccess(ctx),
    close() {
      remotes.close();
    },
  };
}
