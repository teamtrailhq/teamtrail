import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { MarkdownAdapter } from '../adapters/markdown/markdownAdapter';
import { nodeMarkdownFs } from '../adapters/markdown/nodeMarkdownFs';
import { localRepoFiles } from '../verification/localRepoFiles';
import { handleAgents } from './agentRoutes';
import { handleAttention } from './attentionRoutes';
import { sendBridgeError } from './bridgeErrors';
import type { BridgeOptions, TrackerBridge } from './bridgeTypes';
import { handleBriefs } from './briefRoutes';
import { handleCriteriaProposals } from './criteriaProposalRoutes';
import { handleCriteria } from './criteriaRoutes';
import { handleDecisionMemory } from './decisionMemoryRoutes';
import { handleDecisions } from './decisionRoutes';
import { handleFileRoute } from './fileRoute';
import { handleFlakyChecks } from './flakyRoutes';
import { handleGuides } from './guideRoutes';
import { openEventStream, refuseEarly, requestUrl, sendJson } from './http';
import { handleJournal } from './journalRoutes';
import { handleKnowledge } from './knowledgeRoutes';
import { lanPlaces } from './lanPlaces';
import { handleLeases } from './leaseRoutes';
import { handleMainChecks } from './mainChecksRoutes';
import { handleMergeAnyway } from './mergeAnywayRoute';
import { handleModels } from './modelRoutes';
import { neverCrash } from './neverCrash';
import { handlePlan } from './planRoutes';
import { handlePolicy } from './policyRoutes';
import { postProofs } from './postProofs';
import { handleProof } from './proofRoutes';
import { redactResponse } from './redactResponse';
import { handleRemoteAgents } from './remoteAgentRoutes';
import { fromThisMachine, requestRefusal } from './requestGuard';
import { handleReroutes } from './rerouteRoutes';
import { handleScorecard } from './scorecardRoutes';
import { setSecurityHeaders } from './securityHeaders';
import { ELSEWHERE, thisMachineOnly } from './thisMachineRoutes';
import { createTrackerRoutes } from './trackerRoutes';
import { handleTrackerSettings } from './trackerSettingsRoutes';
import { handleTrailChecks } from './trailChecksRoutes';
import { handleTrust } from './trustRoutes';
import { handleVerification } from './verificationRoutes';
import { handleRules } from './verificationRulesRoute';
import { handleScreen } from './verificationScreenRoute';
import { handleVerificationSync } from './verificationSyncRoutes';
import { handleWaivers } from './waiverRoutes';
import { watchAttention } from './watchAttention';
import { watchIntegration } from './watchIntegration';
import { watchLeases } from './watchLeases';
import { watchMachineStore } from './watchMachineStore';
import { watchMainChecks } from './watchMainChecks';
import { watchRemoteAgents } from './watchRemoteAgents';
import { watchRemoteTracker } from './watchRemoteTracker';
import { watchTrackerFolder } from './watchTrackerFolder';
import { watchTrailChecks } from './watchTrailChecks';
import { watchVerification } from './watchVerification';
import { handleWorkspaces } from './workspaceRoutes';

/** Open `/events` streams one address may hold at once. */
const MAX_STREAMS_PER_PEER = 16;

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
    attention: attentionTiming,
    mainChecks: mainChecksTiming,
    trailChecks: trailChecksTiming,
    checkRunner,
    peer,
    allowedHosts,
    streamKey = (req) => req.socket.remoteAddress ?? '',
    repoFiles = localRepoFiles,
    ...trackers
  } = options;
  const abs = path.resolve(root);
  // What the Lookout writes is signed as the trail lead's (or Teamtrail's for them); see signedState/.
  const fs = nodeMarkdownFs(abs, { by: 'lookout' });
  const lanFs = nodeMarkdownFs(abs, { by: 'lookout on another device' });
  const markdown = new MarkdownAdapter({ ...fs, watch: undefined }, abs);
  // The Lookout stays on the approved tracker while a change to trackers.json waits for the human.
  const routes = createTrackerRoutes({ unapproved: 'stay', ...trackers, root: abs, markdown, peer });
  const plugins = factories.map((f) => f({ root: abs, active: () => routes.active(), url: publicUrl }));
  const clients = new Set<ServerResponse>();
  const streams = new Map<string, number>();
  const send = (text: string) => {
    for (const c of clients) c.write(text);
  };
  const unwatch = watchTrackerFolder(abs, fs, send);
  const unwatchLeases = watchLeases(abs, () => routes.active(), send, leaseTiming);
  const ctx = { root: abs, active: () => routes.active(), repoFiles: () => repoFiles(path.dirname(abs)) };
  const places = lanPlaces(abs, trackers.configDir);
  const proofs = postProofs(ctx, { access: routes.proofAccess, configDir: trackers.configDir });
  const reconciler = watchVerification(ctx, { access: routes.ciAccess, send, postProofs: proofs }, reconcilerTiming);
  const attention = watchAttention(ctx, send, { ...attentionTiming, configDir: trackers.configDir });
  // approvals and accepted changes live in the machine store, outside the watched folder
  const store = { root: abs, configDir: trackers.configDir, send };
  const unwatchOutside = [watchRemoteAgents(abs, send), watchMachineStore(store), watchRemoteTracker({ ...ctx, send })];
  unwatchOutside.push(watchIntegration(abs, integrationTiming));
  // checks on main: in Cloud the server's runner runs them, never this process (mainChecks/startMainRun.ts)
  const mainEnv = { root: abs, ...(checkRunner ? { checkRunner } : {}) };
  const mainCtx = { ...ctx, env: mainEnv, changed: () => send('event: main-checks\ndata: {}\n\n') };
  const unwatchMainChecks = watchMainChecks(mainCtx, send, mainChecksTiming);
  const trailChanged = () => send('event: trail-checks\ndata: {}\n\n');
  const trailCtx = { ...ctx, env: mainEnv, configDir: trackers.configDir, changed: trailChanged };
  const unwatchTrailChecks = watchTrailChecks(trailCtx, send, trailChecksTiming);

  type Route = (req: IncomingMessage, res: ServerResponse, url: URL) => Promise<boolean>;
  /** Tried in order; the first that handles the request answers it. */
  const api: Route[] = [
    fileRoute,
    // before the tracker routes, which answer everything else under /trackers
    (req, res, url) => handleTrackerSettings(ctx, req, res, url),
    (req, res, url) => routes.handle(req, res, url),
    ...plugins.map(
      (p): Route =>
        (req, res, url) =>
          p.handle(req, res, url),
    ),
    async (req, res, url) =>
      url.pathname.startsWith('/decisions') &&
      handleDecisions({ adapter: await routes.active(), root: abs }, req, res, url),
    (req, res, url) => handleLeases(ctx, req, res, url),
    (req, res, url) => handleJournal({ root: abs, local: fromThisMachine(req, peer) }, req, res, url),
    (req, res, url) => handleVerification({ ...ctx, local: fromThisMachine(req, peer) }, req, res, url),
    (req, res, url) => handleScreen(ctx, req, res, url),
    (req, res, url) => handleWaivers({ ...ctx, local: fromThisMachine(req, peer) }, req, res, url),
    (req, res, url) => handleRules({ ...ctx, local: fromThisMachine(req, peer) }, req, res, url),
    (req, res, url) => handleVerificationSync({ ...ctx, watch: reconciler }, req, res, url),
    (req, res, url) => handleScorecard(ctx, req, res, url),
    (req, res, url) => handleFlakyChecks(ctx, req, res, url),
    (req, res, url) => handleDecisionMemory(ctx, req, res, url),
    (req, res, url) => handleMergeAnyway(ctx, req, res, url),
    (req, res, url) =>
      handleProof({ ...ctx, configDir: trackers.configDir, kick: () => reconciler.kick() }, req, res, url),
    (req, res, url) => handleAgents(abs, req, res, url),
    (req, res, url) => handleBriefs(ctx, req, res, url),
    (req, res, url) => handlePlan(ctx, req, res, url),
    (req, res, url) => handleReroutes(ctx, req, res, url),
    (req, res, url) => handleKnowledge(abs, req, res, url),
    (req, res, url) => handleCriteriaProposals(abs, req, res, url),
    (req, res, url) => handleCriteria(ctx, req, res, url),
    (req, res, url) => handlePolicy(ctx, req, res, url),
    (req, res, url) =>
      handleAttention({ ...ctx, configDir: trackers.configDir, served: attention.served }, req, res, url),
    (req, res, url) => handleWorkspaces(ctx, req, res, url),
    (req, res, url) => handleMainChecks(mainCtx, req, res, url),
    (req, res, url) => handleTrailChecks(trailCtx, req, res, url),
    (req, res, url) => handleGuides(ctx, req, res, url),
    (req, res, url) => handleModels(ctx, req, res, url),
    (req, res, url) => handleTrust(ctx, req, res, url),
    (req, res, url) => handleRemoteAgents({ ...ctx, local: fromThisMachine(req, peer) }, req, res, url),
  ];

  const files = { root: abs, fs, lanFs, local: (req: IncomingMessage) => fromThisMachine(req, peer) };

  /** The live event stream, and raw file access to the tracker folder (fileRoute.ts). */
  async function fileRoute(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    if (url.pathname === '/events') {
      const who = streamKey(req);
      // A tab needs one stream; a few tabs and a phone, a few more. Past that it's hoarding connections.
      if ((streams.get(who) ?? 0) >= MAX_STREAMS_PER_PEER)
        return (sendJson(res, 429, { error: 'too many open event streams' }), true);
      streams.set(who, (streams.get(who) ?? 0) + 1);
      openEventStream(res);
      clients.add(res);
      req.on('close', () => {
        clients.delete(res);
        streams.set(who, (streams.get(who) ?? 1) - 1);
      });
      return true;
    }
    return handleFileRoute(files, req, res, url);
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    setSecurityHeaders(res, 'api');
    const url = requestUrl(req);
    const refusal = requestRefusal(req, allowedHosts);
    if (refusal) return refuseEarly(res, { error: refusal });
    const local = fromThisMachine(req, peer);
    if (url.pathname === '/machine') return sendJson(res, 200, { local });
    if (!local && thisMachineOnly(req.method, url.pathname))
      return refuseEarly(res, { error: ELSEWHERE, elsewhere: true });
    if (!local) redactResponse(res, places);
    try {
      for (const route of api) if (await route(req, res, url)) return;
      res.statusCode = 404;
      res.end('not found');
    } catch (err) {
      sendBridgeError(res, err);
    }
  }

  return {
    root: abs,
    handle: neverCrash(handle),
    active: () => routes.active(),
    close() {
      for (const p of plugins) p.close();
      routes.close();
      unwatch();
      unwatchLeases();
      attention.stop();
      for (const stop of unwatchOutside) stop();
      unwatchMainChecks();
      unwatchTrailChecks();
      reconciler.stop();
      for (const c of clients) c.end();
      clients.clear();
    },
  };
}
