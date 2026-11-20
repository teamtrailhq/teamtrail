/**
 * A server that embeds the Lookout with its own sign-in, as Teamtrail Cloud does, for the end-to-end check
 * (verifyManaged.mjs): the built Lookout bundle, the projects hub with an external sign-in that admits every request as
 * this machine, and the server's own places `GET /session` names (`managed.setup`, `managed.trailAgents`), faked in
 * memory. `setup` and `agents` are the state those answer; the step changes them in place.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createProjectsHub, createTrackerBridge, type ExternalSignIn } from '../packages/core/src/bridge';
import { sendJson } from '../packages/core/src/server/http';

const API = '/__teamtrail';
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
};

export interface ManagedState {
  setup: { done: number; total: number; complete: boolean; steps: { title: string; href: string; done: boolean }[] };
  agents: { canRun: boolean; repos: string[]; on: boolean; running: number };
}

function serveApp(appDir: string, pathname: string, res: http.ServerResponse) {
  let file = path.join(appDir, path.normalize(pathname));
  if (!file.startsWith(appDir + path.sep) || !existsSync(file) || statSync(file).isDirectory())
    file = path.join(appDir, 'index.html');
  res.setHeader('Content-Type', TYPES[path.extname(file)] ?? 'application/octet-stream');
  res.end(readFileSync(file));
}

async function body(req: http.IncomingMessage) {
  let text = '';
  for await (const c of req) text += c;
  return text ? JSON.parse(text) : {};
}

export async function startManagedHost(o: { root: string; configDir: string; appDir: string; state: ManagedState }) {
  const managed = { name: 'Ada', setup: '/fake/setup', trailAgents: '/fake/trail-agents', tracker: 'markdown' };
  const external: ExternalSignIn = {
    admit(req, res, at) {
      if (at.route === '/session') return void sendJson(res, 200, { signedIn: true, managed });
      return { id: 'ada', kind: 'machine' };
    },
  };
  const options = { configDir: o.configDir, env: {} };
  const bridge = createTrackerBridge(o.root, { ...options, cwd: path.dirname(o.root) });
  const hub = createProjectsHub({
    home: bridge,
    openBridge: (p) => createTrackerBridge(p.root, options),
    configDir: o.configDir,
    external,
  });
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (url.pathname === API || url.pathname.startsWith(`${API}/`)) {
      req.url = req.url!.slice(API.length) || '/';
      return void hub.handle(req, res);
    }
    if (url.pathname === '/fake/setup') return sendJson(res, 200, o.state.setup);
    if (url.pathname === '/fake/trail-agents') {
      if (req.method !== 'POST') return sendJson(res, 200, o.state.agents);
      return void body(req).then((b: { on?: boolean }) => {
        o.state.agents = { ...o.state.agents, on: b.on === true, running: b.on === true ? 1 : 0 };
        sendJson(res, 200, o.state.agents);
      });
    }
    serveApp(o.appDir, url.pathname, res);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}/`;
  return {
    url,
    close: () => {
      hub.close();
      bridge.close();
      server.closeAllConnections();
      server.close();
    },
  };
}
