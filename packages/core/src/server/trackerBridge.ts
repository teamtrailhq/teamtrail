import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { MarkdownAdapter } from '../adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../adapters/markdown/nodeMarkdownFs';
import { AnswerError } from '../agents/agentDocs';
import { handleAgents } from './agentRoutes';
import { handleAttention } from './attentionRoutes';
import type { BridgeOptions, TrackerBridge } from './bridgeTypes';
import { handleBriefs } from './briefRoutes';
import { handleCriteria } from './criteriaRoutes';
import { handleDecisions } from './decisionRoutes';
import { handleGuides } from './guideRoutes';
import { BadRequest, openEventStream, readText, sendJson } from './http';
import { handleJournal } from './journalRoutes';
import { handleKnowledge } from './knowledgeRoutes';
import { handleLeases } from './leaseRoutes';
import { handleModels } from './modelRoutes';
import { handlePolicy } from './policyRoutes';
import { handleRemoteAgents } from './remoteAgentRoutes';
import { handleReroutes } from './rerouteRoutes';
import { sendTrackerError } from './trackerErrors';
import { createTrackerRoutes } from './trackerRoutes';
import { handleVerification } from './verificationRoutes';
import { handleVerificationSync } from './verificationSyncRoutes';
import { watchAttention } from './watchAttention';
import { watchIntegration } from './watchIntegration';
import { watchLeases } from './watchLeases';
import { watchRemoteAgents } from './watchRemoteAgents';
import { watchTrackerFolder } from './watchTrackerFolder';
import { watchVerification } from './watchVerification';
import { handleWorkspaces } from './workspaceRoutes';

/**
 * HTTP API for the local-markdown tracker. Shared by the Vite dev plugin and
 * the `teamtrail` CLI so both serve the same contract.
 */
export function createTrackerBridge(root: string, options: BridgeOptions = {}): TrackerBridge {
  const {
    plugins: factories = [],
    url: publicUrl = () => undefined,
    leases: leaseTiming,
    reconciler: reconcilerTiming,
    integration: integrationTiming,
    ...trackers
  } = options;
  const abs = path.resolve(root);
  const fs = nodeMarkdownFs(abs);
  const markdown = new MarkdownAdapter({ ...fs, watch: undefined }, abs);
  const routes = createTrackerRoutes({ ...trackers, root: abs, markdown });
  const plugins = factories.map((f) => f({ root: abs, active: () => routes.active(), url: publicUrl }));
  const clients = new Set<ServerResponse>();
  const send = (text: string) => {
    for (const c of clients) c.write(text);
  };
  const unwatch = watchTrackerFolder(abs, fs, send);
  const unwatchLeases = watchLeases(abs, () => routes.active(), send, leaseTiming);
  const ctx = { root: abs, active: () => routes.active() };
  const reconciler = watchVerification(ctx, { access: routes.ciAccess, send }, reconcilerTiming);
  const unwatchAttention = watchAttention(ctx, send, { configDir: trackers.configDir });
  const unwatchIntegration = watchIntegration(abs, integrationTiming);
  const unwatchRemoteAgents = watchRemoteAgents(abs, send);

  type Route = (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<boolean>;
  /** Tried in order; the first that handles the request answers it. */
  const api: Route[] = [
    fileRoute,
    (req, res, url) => routes.handle(req, res, url),
    ...plugins.map(
      (p): Route =>
        (req, res, url) =>
          p.handle(req, res, url),
    ),
    async (req, res, url) =>
      url.pathname.startsWith('/decisions') && handleDecisions(await routes.active(), req, res, url),
    (req, res, url) => handleLeases(ctx, req, res, url),
    (req, res, url) => handleJournal(abs, req, res, url),
    (req, res, url) => handleVerification(ctx, req, res, url),
    (req, res, url) => handleVerificationSync({ ...ctx, watch: reconciler }, req, res, url),
    (req, res, url) => handleAgents(abs, req, res, url),
    (req, res, url) => handleBriefs(ctx, req, res, url),
    (req, res, url) => handleReroutes(ctx, req, res, url),
    (req, res, url) => handleKnowledge(abs, req, res, url),
    (req, res, url) => handleCriteria(abs, req, res, url),
    (req, res, url) => handlePolicy(ctx, req, res, url),
    (req, res, url) => handleAttention({ ...ctx, configDir: trackers.configDir }, req, res, url),
    (req, res, url) => handleWorkspaces(ctx, req, res, url),
    (req, res, url) => handleGuides(ctx, req, res, url),
    (req, res, url) => handleModels(ctx, req, res, url),
    (req, res, url) => handleRemoteAgents(ctx, req, res, url),
  ];

  /** The live event stream and raw file access to the tracker folder. */
  async function fileRoute(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (url.pathname === '/events') {
      openEventStream(res);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return true;
    }
    if (url.pathname === '/list') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ root: abs, files: await fs.list() }));
      return true;
    }
    if (url.pathname !== '/file') return false;
    const p = url.searchParams.get('path') ?? '';
    if (req.method === 'PUT') {
      await fs.write(p, await readText(req));
      res.end('ok');
      return true;
    }
    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.end(await fs.read(p));
    return true;
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? '/', 'http://x');
    try {
      for (const route of api) if (await route(req, res, url)) return;
      res.statusCode = 404;
      res.end('not found');
    } catch (err) {
      sendError(res, err);
    }
  }

  return {
    root: abs,
    handle,
    active: () => routes.active(),
    close() {
      for (const p of plugins) p.close();
      routes.close();
      unwatch();
      unwatchLeases();
      unwatchAttention();
      unwatchIntegration();
      unwatchRemoteAgents();
      reconciler.stop();
      for (const c of clients) c.end();
      clients.clear();
    },
  };
}

function sendError(res: ServerResponse, err: unknown) {
  if (err instanceof BadRequest) return sendJson(res, 400, { error: err.message });
  if (err instanceof AnswerError) return sendJson(res, 409, { error: err.message });
  if (sendTrackerError(res, err)) return;
  res.statusCode = 500;
  res.end(String(err));
}
