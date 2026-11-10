import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  configDir,
  crossSite,
  type BridgeContext,
  type BridgePlugin,
  type BridgePluginFactory,
} from '@teamtrail/core/bridge';
import { OwnerError, SlackService, type SlackServiceOptions } from './service';
import type { SlackSettingsPatch } from './types';

export { SlackService, type SlackServiceOptions } from './service';
export { SlackApi, SlackApiError } from './api';
export { SocketMode, probeSocket, type Envelope, type WebSocketCtor, type WebSocketLike } from './socket';
export * from './index';

class BadRequest extends Error {}

type Reply = { status: number; body: unknown };

/**
 * The Slack routes. Tokens are verified and stored here, in the local process,
 * and never sent back to the browser:
 *   GET    /slack            SlackStatus
 *   POST   /slack/created    step 1 done (Slack's create-from-manifest page was opened)
 *   POST   /slack/token      `{ token }` → SlackTokenResult (xapp- or xoxb-, routed by prefix, checked live)
 *   PUT    /slack/settings   SlackSettingsPatch → SlackStatus
 *   POST   /slack/owner/code     → SlackOwnerCode: a one-time code to enter in Slack; the only answer that holds it
 *   POST   /slack/owner/confirm  `{ id }` → SlackStatus: the Slack account put forward is the trail lead's
 *   POST   /slack/owner/reset    no owner, nobody put forward, no code
 *   GET    /slack/members    `{ members: SlackUser[] }` for the allowlist picker
 *   DELETE /slack            Remove: disconnect and forget tokens and settings
 * Everything but `GET /slack` answers this machine only (core's thisMachineRoutes.ts); owner changes are journaled.
 * There is no route for Slack to call: what happens in Slack arrives over Socket Mode.
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
    'DELETE /slack': () => ok(service.remove()),
    'POST /slack/created': () => ok(service.markCreated()),
    'POST /slack/token': async (req) => {
      const b = await body<{ token?: unknown }>(req);
      if (typeof b.token !== 'string' || !b.token.trim()) throw new BadRequest('"token" is required');
      const r = await service.pasteToken(b.token);
      return { status: r.ok ? 200 : 400, body: r };
    },
    'PUT /slack/settings': async (req) => ok(service.updateSettings(await body<SlackSettingsPatch>(req))),
    'POST /slack/owner/code': () => ok(service.startOwnerCode()),
    'POST /slack/owner/confirm': async (req) => {
      const b = await body<{ id?: unknown }>(req);
      if (typeof b.id !== 'string' || !b.id) throw new BadRequest('"id" is required');
      return ok(await service.confirmOwner(b.id));
    },
    'POST /slack/owner/reset': () => ok(service.resetOwner()),
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
      const bad = err instanceof BadRequest || err instanceof OwnerError;
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
