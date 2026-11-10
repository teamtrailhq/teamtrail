import type { IncomingMessage, ServerResponse } from 'node:http';
import type { TrackerAdapter } from '../adapters/adapter';
import type { RemoteKind, TrackerConnectRequest, TrackerTestRequest } from '../adapters/remote/types';
import { githubCiAccess } from './githubCiAccess';
import { githubLookups } from './githubLookups';
import { handleGitHubRepos } from './githubRepoRoutes';
import { githubSignIn } from './githubSignIn';
import { GITHUB_SIGN_IN, handleGitHubSignIn } from './githubSignInRoutes';
import { BadRequest, readJson, sendFailure, sendJson } from './http';
import { lanCallRefusal } from './lanCallRefusal';
import { linearLookups } from './linearLookups';
import { handleLinearTeams, LINEAR_PROJECTS, LINEAR_TEAMS } from './linearTeamRoutes';
import { isKind, remoteAdapters } from './remoteAdapters';
import { fromThisMachine } from './requestGuard';
import { CALLS } from './trackerCalls';
import { trackerContext, type TrackerRoutesOptions } from './trackerContext';
import { crossSite, sendTrackerError } from './trackerErrors';
import { streamTrackerEvents } from './trackerEvents';
import { trackerSettings } from './trackerSettings';

export type { TrackerRoutesOptions } from './trackerContext';

const GITHUB_REPOS = '/trackers/github/repos';
const isSignIn = (p: string) => p === GITHUB_SIGN_IN || p.startsWith(`${GITHUB_SIGN_IN}/`);
const isLookup = (p: string) => p === GITHUB_REPOS || p === LINEAR_TEAMS || p === LINEAR_PROJECTS || isSignIn(p);

/**
 * Tracker settings and the remote-tracker API. Credentials are read and
 * stored here, in the local process, and never sent to the browser:
 *   GET    /trackers                       TrackerSettings
 *   PUT    /trackers                       TrackerConnectRequest → TrackerSettings (tests the connection first)
 *   POST   /trackers/test                  TrackerTestRequest → TrackerTestResult
 *   GET    /trackers/github/repos          GitHubRepoList: repos the found token can track issues in, and its login
 *   GET    /trackers/linear/teams          LinearTeamList: teams the key can access, and who it belongs to (POST
 *                                          `{ apiKey }` for a key pasted in the page)
 *   GET    /trackers/linear/projects?team= LinearProjectList: that team's projects (POST `{ apiKey, teamId }`)
 *   POST   /trackers/github/sign-in/start|poll|cancel, DELETE /trackers/github/sign-in
 *                                          Sign in with GitHub (device flow) and sign out; see githubSignInRoutes.ts
 *   DELETE /trackers/credentials/<kind>    forget the saved token / key
 *   POST   /tracker/<kind>/call            `{ method, args }` → `{ result }` (TrackerAdapter methods)
 *   GET    /tracker/<kind>/events          SSE: TrackerEvent per message; named `status` events (SyncStatus & { location })
 */
export function createTrackerRoutes(o: TrackerRoutesOptions) {
  const ctx = trackerContext(o);
  const remotes = remoteAdapters(ctx);
  const lookups = githubLookups(ctx);
  const linear = linearLookups(ctx);
  const signIn = githubSignIn({ ctx, changed: () => githubChanged() });
  const { settings, test, connect } = trackerSettings({ ctx, remotes, lookups, linear, signIn });
  remotes.resumeQueued();

  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    const call = p.match(/^\/tracker\/([^/]+)\/(call|events)$/);
    const forget = p.match(/^\/trackers\/credentials\/([^/]+)$/);
    const own = p === '/trackers' || p === '/trackers/test' || !!call || !!forget;
    if (!own && !isLookup(p)) return false;
    try {
      if (crossSite(req)) return (void sendJson(res, 403, { error: 'cross-site request refused' }), true);
      if (!own) return await lookupRoute(req, res, url);
      const handled = call ? await remoteRoute(req, res, call) : await settingsRoute(req, res, p, forget);
      if (!handled) sendJson(res, 405, { error: 'method not allowed' });
    } catch (err) {
      if (err instanceof BadRequest) sendJson(res, 400, { error: err.message });
      else if (!sendTrackerError(res, err)) sendFailure(res, err);
    }
    return true;
  }

  /** The pickers' lookups and Sign in with GitHub. */
  function lookupRoute(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (p === GITHUB_REPOS) return handleGitHubRepos(req, res, { path: p, lookups });
    if (isSignIn(p)) return handleGitHubSignIn(req, res, { path: p, signIn, settings });
    return handleLinearTeams(req, res, { url, lookups: linear });
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
    ctx.creds.update((c) => {
      const { [kind]: _gone, ...rest } = c;
      return rest;
    });
    remotes.reset(kind);
    ctx.forgetGitHubToken();
    lookups.reset();
    linear.reset();
  }

  /** A GitHub token was saved or forgotten by signing in or out: resolve it again. */
  function githubChanged() {
    ctx.forgetGitHubToken();
    lookups.reset();
    remotes.reset('github');
  }

  /** `/tracker/<kind>/events` and `/tracker/<kind>/call`. */
  async function remoteRoute(req: IncomingMessage, res: ServerResponse, match: RegExpMatchArray): Promise<boolean> {
    const [, kind, action] = match;
    if (!isKind(kind)) throw new BadRequest('unknown tracker');
    if (action === 'events' && req.method === 'GET')
      return (streamTrackerEvents(() => remotes.get(kind), req, res), true);
    // Only the tracker the project uses: another one with stored credentials is not this project's to drive.
    if (ctx.project.read().active !== kind)
      return (void sendJson(res, 409, { error: `${kind} is not the tracker this project uses` }), true);
    if (action === 'call' && req.method === 'POST') {
      const body = await readJson<{ method?: string; args?: unknown[] }>(req, '{}');
      const refused = fromThisMachine(req, o.peer) ? undefined : lanCallRefusal(String(body.method), body.args ?? []);
      if (refused) return (void sendJson(res, 403, { error: refused, elsewhere: true }), true);
      const result = await callAdapter(kind, body);
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
