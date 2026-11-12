import type { IncomingMessage, ServerResponse } from 'node:http';
import { clientAddress } from './http/clientAddress';
import { reply } from './http/reply';
import { handleCallback } from './install/handleCallback';
import { handleInstall } from './install/handleInstall';
import { handleInstallSlack } from './install/handleInstallSlack';
import { linkRoutes } from './install/linkRoutes';
import type { ServiceContext } from './serviceContext';
import { handleSlack } from './slack/handleSlack';

/** The service's own address in a browser leads to Scout's page on the site. */
const HOME = 'https://teamtrail.app/slack';

const SLACK_PATHS = {
  '/slack/events': 'events',
  '/slack/interactions': 'interactions',
  '/slack/commands': 'commands',
} as const;

/** Routes called by people's browsers and Lookouts, limited per client address. */
const LIMITED = new Set(['/install', '/install-slack', '/oauth/callback', '/link', '/link/preview']);

function slackPath(pathname: string) {
  return SLACK_PATHS[pathname as keyof typeof SLACK_PATHS];
}

/** The service's HTTP routes. Anything else is a 404; nothing is served from disk. */
export async function route(ctx: ServiceContext, req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', 'http://service');
  const method = req.method ?? 'GET';
  const limited = LIMITED.has(url.pathname) && !ctx.httpLimit.take(clientAddress(req, ctx.config.trustProxy));
  if (limited) return reply.json(res, 429, { error: 'ratelimited' });
  const slack = slackPath(url.pathname);
  if (slack && method === 'POST') return handleSlack(ctx, req, res, slack);
  if (url.pathname === '/install' && method === 'GET') return handleInstall(ctx, url, res);
  if (url.pathname === '/install-slack' && method === 'GET') return handleInstallSlack(ctx, res);
  if (url.pathname === '/oauth/callback' && method === 'GET') return handleCallback(ctx, url, res);
  if (url.pathname === '/link' || url.pathname === '/link/preview') return linkRoutes(ctx, req, res, url.pathname);
  if (url.pathname === '/health' && method === 'GET') return reply.json(res, 200, { ok: true });
  if (url.pathname === '/' && method === 'GET') return reply.redirect(res, HOME, 302);
  reply.json(res, 404, { error: 'not_found' });
}
