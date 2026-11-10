import type { IncomingMessage, ServerResponse } from 'node:http';
import { journalFile } from '../history/journalFile';
import { REMOTE_AGENTS_JOURNAL, type RemoteAgentAction } from '../model/lifecycle';
import type { RemoteTokenView } from '../model/remoteToken';
import { OperationError } from '../planning/operations/operationError';
import { readMcpEndpoints } from '../remoteAgents/mcpEndpoints';
import { createRemoteToken, remoteTokenViews, revokeRemoteToken } from '../remoteAgents/remoteTokens';
import { TRAIL_LEAD } from './guideJournal';
import { BadRequest, readJson, sendJson } from './http';
import type { RouteContext } from './routeContext';
import { ELSEWHERE } from './thisMachineRoutes';
import { crossSite } from './trackerErrors';

const view = (root: string) => ({ tokens: remoteTokenViews(root), endpoints: readMcpEndpoints(root) });

/** Records the trail lead's token change in the project's history: the token's id and name, never its value. */
function journal(root: string, action: RemoteAgentAction, token: RemoteTokenView) {
  journalFile(root).append({
    v: 1,
    kind: 'remote-agent',
    at: Date.now(),
    mapId: REMOTE_AGENTS_JOURNAL,
    action,
    tokenId: token.id,
    name: token.name,
    actor: TRAIL_LEAD,
    actorKind: 'trail lead',
  });
}

/**
 * `/remote-agents`: who may reach the MCP endpoint over HTTP (Settings → Remote agents). The trail lead's routes:
 * no agent token opens them, other sites can't drive them from a browser, and they answer only requests from
 * this machine (`local`, from the socket's address): another device gets 403 `{ elsewhere: true }`.
 *   GET  /remote-agents                 `{ tokens: RemoteTokenView[], endpoints: McpEndpoint[] }`
 *   POST /remote-agents/tokens          body `{ name }` → `{ token, created, tokens, endpoints }`; the only time
 *                                       the token's value leaves the server
 *   POST /remote-agents/tokens/revoke   body `{ id }` → `{ tokens, endpoints }`; that token's sessions end
 * False when the path doesn't match.
 */
export async function handleRemoteAgents(
  ctx: RouteContext & { local: boolean },
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) {
  if (url.pathname !== '/remote-agents' && !url.pathname.startsWith('/remote-agents/')) return false;
  if (crossSite(req)) return (sendJson(res, 403, { error: 'cross-site request refused' }), true);
  // Tokens are made and revoked on the machine itself: another device on the network gets nothing here.
  if (!ctx.local) return (sendJson(res, 403, { error: ELSEWHERE, elsewhere: true }), true);
  // The response may carry a token: no cache may keep it.
  res.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/remote-agents' && req.method === 'GET') return (sendJson(res, 200, view(ctx.root)), true);
  if (url.pathname === '/remote-agents/tokens' && req.method === 'POST') {
    const body = await readJson<{ name?: unknown }>(req, '{}');
    try {
      const { token, view: created } = createRemoteToken(ctx.root, body.name);
      journal(ctx.root, 'token-created', created);
      sendJson(res, 200, { token, created, ...view(ctx.root) });
    } catch (e) {
      if (!(e instanceof OperationError)) throw e;
      sendJson(res, 400, { error: e.message });
    }
    return true;
  }
  if (url.pathname === '/remote-agents/tokens/revoke' && req.method === 'POST') {
    const body = await readJson<{ id?: unknown }>(req, '{}');
    if (typeof body.id !== 'string') throw new BadRequest('"id" is required');
    const gone = revokeRemoteToken(ctx.root, body.id);
    if (!gone) return (sendJson(res, 404, { error: 'no such token', ...view(ctx.root) }), true);
    journal(ctx.root, 'token-revoked', gone);
    sendJson(res, 200, view(ctx.root));
    return true;
  }
  return false;
}
