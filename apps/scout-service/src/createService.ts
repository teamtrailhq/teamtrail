import { createServer, type Server } from 'node:http';
import { WebSocketServer } from 'ws';
import { TokenCipher } from './crypto/TokenCipher';
import { clientAddress } from './http/clientAddress';
import { RateLimit } from './http/RateLimit';
import { reply } from './http/reply';
import { Hub } from './hub/Hub';
import { LIMITS } from './limits';
import { log as stdoutLog } from './log';
import { route } from './route';
import type { ServiceContext } from './serviceContext';
import type { Logger, ServiceConfig, ServiceStore } from './types';

export interface ScoutService {
  server: Server;
  ctx: ServiceContext;
  close(): Promise<void>;
}

interface Options {
  config: ServiceConfig;
  store: ServiceStore;
  log?: Logger;
  now?: () => number;
  fetch?: typeof fetch;
}

/** The Scout service: Slack's request URLs, the install and link routes, and `/connect` for linked Teamtrails. */
export function createService(o: Options): ScoutService {
  const now = o.now ?? Date.now;
  const log = o.log ?? stdoutLog;
  const base = {
    config: o.config,
    store: o.store,
    cipher: new TokenCipher(o.config.tokenKey),
    log,
    now,
    fetch: o.fetch ?? fetch,
    members: new Map<string, { ok: boolean; until: number }>(),
  };
  const hub = new Hub(base);
  const httpLimit = new RateLimit({ burst: LIMITS.httpBurst, perMinute: LIMITS.httpPerMinute, now });
  const ctx: ServiceContext = {
    ...base,
    hub,
    httpLimit,
    recentEvents: new Set(),
    replays: new Map(),
    offlineSaid: new RateLimit({ burst: LIMITS.offlineReplyBurst, perMinute: LIMITS.offlineRepliesPerMinute, now }),
  };
  const upgrades = new RateLimit({ burst: LIMITS.upgradeBurst, perMinute: LIMITS.upgradePerMinute, now });

  const server = createServer((req, res) => {
    route(ctx, req, res).catch(() => {
      log('request.failed', { path: req.url?.split('?')[0] });
      if (!res.headersSent) reply.json(res, 500, { error: 'failed' });
      else res.end();
    });
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: LIMITS.socketMessageBytes });
  server.on('upgrade', (req, socket, head) => {
    const address = clientAddress(req, o.config.trustProxy);
    if (req.url !== '/connect') return socket.destroy();
    if (!upgrades.take(address)) {
      socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    sockets.handleUpgrade(req, socket, head, (ws) => hub.attach(ws, address));
  });
  const purge = setInterval(() => void o.store.purge(now()).catch(() => {}), LIMITS.purgeMs);
  purge.unref();

  return {
    server,
    ctx,
    async close() {
      clearInterval(purge);
      hub.closeAll();
      sockets.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await o.store.close();
    },
  };
}
