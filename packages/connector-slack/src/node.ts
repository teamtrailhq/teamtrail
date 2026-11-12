import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  configDir,
  crossSite,
  type BridgeContext,
  type BridgePlugin,
  type BridgePluginFactory,
} from '@teamtrail/core/bridge';
import { ConnectError, SlackService, type SlackServiceOptions } from './service';
import type { SlackSettingsPatch } from './types';

export { SlackService, type SlackServiceOptions } from './service';
export { SlackApi, SlackApiError } from './api';
export { ScoutLink } from './link/scoutLink';
export { SCOUT_SERVICE, scoutService } from './link/scoutService';
export type {
  ClientMessage,
  Envelope,
  EnvelopeResult,
  LinkReady,
  ServerMessage,
  WebSocketCtor,
  WebSocketLike,
} from './link/types';
export * from './index';

class BadRequest extends Error {}

type Reply = { status: number; body: unknown };

/**
 * The Slack routes. The link token is stored here, in the local process, and never sent back to the browser:
 *   GET    /slack                  SlackStatus
 *   POST   /slack/connect/start    → SlackConnectStart: the address that adds Scout to Slack (a PKCE verifier stays here)
 *   POST   /slack/connect/finish   `{ code }` → SlackStatus: the browser came back; the code and verifier become a link
 *   DELETE /slack/connect          → SlackStatus: revoke the link at the Scout service, forget Slack on this machine
 *   PUT    /slack/settings         SlackSettingsPatch → SlackStatus
 *   GET    /slack/members          `{ members: SlackUser[] }` for the allowlist picker
 * Everything but `GET /slack` answers this machine only (core's thisMachineRoutes.ts); connecting and
 * disconnecting are journaled. Slack never calls this server: its requests reach it through the Scout service.
 */
export function slackRoutes(service: SlackService) {
  const json = (res: ServerResponse, status: number, v: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(v));
  };
  async function body<T>(req: IncomingMessage): Promise<T> {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as T;
    } catch {
      throw new BadRequest('body must be JSON');
    }
  }
  const ok = (v: unknown): Reply => ({ status: 200, body: v });
  const routes: Record<string, (req: IncomingMessage) => Reply | Promise<Reply>> = {
    'GET /slack': () => ok(service.status()),
    'POST /slack/connect/start': (req) => ok(service.startConnect(req.socket.localPort)),
    'POST /slack/connect/finish': async (req) => {
      const b = await body<{ code?: unknown }>(req);
      if (typeof b.code !== 'string' || !b.code) throw new BadRequest('"code" is required');
      return ok(await service.finishConnect(b.code));
    },
    'DELETE /slack/connect': async () => ok(await service.disconnect()),
    'PUT /slack/settings': async (req) => ok(service.updateSettings(await body<SlackSettingsPatch>(req))),
    'GET /slack/members': async () => ok({ members: await service.members() }),
  };
  return async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const p = url.pathname;
    if (p !== '/slack' && !p.startsWith('/slack/')) return false;
    try {
      if (crossSite(req)) return (json(res, 403, { error: 'cross-site request refused' }), true);
      const route = routes[`${req.method} ${p}`];
      if (!route) return (json(res, 405, { error: 'method not allowed' }), true);
      const r = await route(req);
      json(res, r.status, r.body);
    } catch (err) {
      const bad = err instanceof BadRequest || err instanceof ConnectError;
      json(res, bad ? 400 : 500, { error: String((err as Error)?.message ?? err) });
    }
    return true;
  };
}

/** Optional module for the local server: `createTrackerBridge(root, { plugins: [slackPlugin()] })`. */
export function slackPlugin(
  o: Partial<Omit<SlackServiceOptions, 'root' | 'active' | 'url'>> = {},
): BridgePluginFactory {
  return (ctx: BridgeContext): BridgePlugin => {
    const service = new SlackService({
      pollMs: 1000,
      interruptOnly: true,
      ...o,
      configDir: o.configDir ?? configDir(o.env),
      root: ctx.root,
      active: ctx.active,
      url: ctx.url,
    });
    const handle = slackRoutes(service);
    return { handle, close: () => service.close() };
  };
}
