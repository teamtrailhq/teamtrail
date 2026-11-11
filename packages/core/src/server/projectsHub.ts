import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { writeLookoutLock } from '../agents/lookoutLock';
import type { ProjectEntry, ProjectState } from '../model/project';
import { insideRoot } from '../projects/confinePath';
import { verifiedElsewhere } from '../projects/elsewhereUrl';
import { fileAdapter } from '../projects/fileAdapter';
import { ProjectBridges, type ProjectBridgesOptions } from '../projects/projectBridges';
import { projectEntries } from '../projects/projectEntries';
import { projectId } from '../projects/projectId';
import { projectState } from '../projects/projectState';
import { projectsView } from '../projects/projectsView';
import { sendBridgeError } from './bridgeErrors';
import type { TrackerBridge } from './bridgeTypes';
import { BadRequest, refuseEarly, requestUrl, sendJson } from './http';
import { lanPlaces } from './lanPlaces';
import { neverCrash } from './neverCrash';
import { handleProjects } from './projectRoutes';
import { redactResponse } from './redactResponse';
import { fromThisMachine, requestRefusal, type PeerAddress } from './requestGuard';
import { setSecurityHeaders } from './securityHeaders';
import { ELSEWHERE, thisMachineOnly } from './thisMachineRoutes';
import { configDir as defaultConfigDir } from './trackerConfig';
import { watchProjects } from './watchProjects';

export interface ProjectsHubOptions {
  /** The bridge of the folder this process was started in; the un-prefixed API keeps serving it. */
  home: TrackerBridge;
  /** Starts a full bridge for another project, on first use. */
  openBridge: (entry: ProjectEntry) => TrackerBridge;
  configDir?: string;
  /** The Lookout's URL, once it is serving; written into the lock of each project it opens. */
  url?: () => string | undefined;
  bridges?: Omit<ProjectBridgesOptions, 'open'>;
  /** Who is on the other end of a connection; default the socket's remote address. Tests stand in another device. */
  peer?: PeerAddress;
  /** How often project summaries are recomputed while a Lookout listens. */
  pollMs?: number;
}

export type ProjectsHub = ReturnType<typeof createProjectsHub>;

/** A `?path=` (raw file routes) must stay inside the project once symlinks resolve, and never be a credential file. */
function checkPath(root: string, url: URL) {
  const p = url.searchParams.get('path');
  if (p === null) return;
  if (!insideRoot(root, p) || path.basename(p) === 'credentials.json') throw new BadRequest('path escapes the project');
}

/**
 * One Lookout, many projects. In front of the home bridge it serves the `/projects` routes (the registry,
 * the overview and answers) and `/p/<projectId>/…`, which forwards to that project's own bridge: the same
 * routes as the un-prefixed API, for registered projects only. Bridges start lazily, capped, and close when
 * idle; a project another `teamtrail` serves is only read, never opened here.
 */
export function createProjectsHub(o: ProjectsHubOptions) {
  const configDir = o.configDir ?? defaultConfigDir();
  const homeId = projectId(o.home.root);
  const places = lanPlaces(o.home.root, configDir);
  const bridges = new ProjectBridges({
    ...o.bridges,
    open(entry) {
      const bridge = o.openBridge(entry);
      const base = o.url?.();
      const unlock = base ? writeLookoutLock(entry.root, `${base}?project=${entry.id}`) : () => {};
      return { ...bridge, close: () => (unlock(), bridge.close()) };
    },
  });
  const entries = () => projectEntries(configDir, o.home.root).entries;
  /** A project another live `teamtrail` took over is closed here, so one root never has two reconcilers. */
  const stateOf = (entry: ProjectEntry): ProjectState => {
    if (entry.id === homeId) return { kind: 'ok' };
    const state = projectState(entry.root);
    if (state.kind !== 'ok') bridges.drop(entry.id);
    return state;
  };
  const adapterOf = async (entry: ProjectEntry, state: ProjectState) => {
    if (entry.id === homeId) return o.home.active();
    const open = bridges.peek(entry.id);
    if (open) return open.active();
    return state.kind === 'missing' ? undefined : fileAdapter(entry.root, configDir);
  };
  const view = () => {
    const { entries: list, autoRegister } = projectEntries(configDir, o.home.root);
    return projectsView({ configDir, homeId, entries: list, autoRegister, stateOf, adapterOf });
  };
  const watcher = watchProjects({ view, active: () => entries().length > 1, pollMs: o.pollMs });
  const ctx = {
    configDir,
    entries,
    stateOf,
    adapterOf,
    view,
    changed: (removed?: string) => {
      if (removed && removed !== homeId) bridges.drop(removed);
      watcher.refresh();
    },
  };

  /** `/p/<id>/<rest>`: the project's bridge, after the id and any file path are checked. */
  async function forward(req: IncomingMessage, res: ServerResponse, at: { id: string; rest: string; url: URL }) {
    const { id, rest, url } = at;
    const entry = entries().find((e) => e.id === id);
    if (!entry) return sendJson(res, 404, { error: `unknown project "${id}"` });
    const state = stateOf(entry);
    if (state.kind === 'missing') return sendJson(res, 404, { error: 'project folder not found' });
    if (state.kind === 'elsewhere') {
      const checked = await verifiedElsewhere(entry.root, state);
      const there = checked.kind === 'elsewhere' ? checked.url : undefined;
      return sendJson(res, 409, { error: 'another Lookout serves this project', ...(there ? { url: there } : {}) });
    }
    checkPath(entry.root, url);
    const bridge = id === homeId ? o.home : bridges.get(entry);
    req.url = rest + url.search;
    if (rest === '/events') {
      const release = bridges.hold(id);
      req.on('close', release);
      watcher.listen(req, res);
    }
    await bridge.handle(req, res);
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    setSecurityHeaders(res, 'api');
    const url = requestUrl(req);
    const refusal = requestRefusal(req);
    if (refusal) return refuseEarly(res, { error: refusal });
    // The same list for every project: `/p/<id>/policy` is `/policy` of that project.
    const inProject = /^\/p\/[^/]+(\/.*)?$/.exec(url.pathname);
    const route = inProject ? (inProject[1] ?? '/') : url.pathname;
    const local = fromThisMachine(req, o.peer);
    if (!local && thisMachineOnly(req.method, route)) return refuseEarly(res, { error: ELSEWHERE, elsewhere: true });
    if (!local) redactResponse(res, places);
    try {
      const m = /^\/p\/([^/]+)(\/.*)?$/.exec(url.pathname);
      if (m) return await forward(req, res, { id: m[1], rest: m[2] ?? '/', url });
      if (await handleProjects(ctx, req, res, url)) return;
      if (url.pathname === '/events') watcher.listen(req, res);
      await o.home.handle(req, res);
    } catch (err) {
      sendBridgeError(res, err);
    }
  }

  return {
    homeId,
    bridges,
    handle: neverCrash(handle),
    close() {
      watcher.stop();
      bridges.close();
    },
  };
}
