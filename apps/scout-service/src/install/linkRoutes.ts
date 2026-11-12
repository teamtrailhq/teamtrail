import type { IncomingMessage, ServerResponse } from 'node:http';
import { reply } from '../http/reply';
import type { ServiceContext } from '../serviceContext';
import { createLink } from './createLink';
import { deleteLink } from './deleteLink';
import { previewLink } from './previewLink';

/**
 * `/link` and `/link/preview`: called by a Lookout's server, never a page. A browser's cross-site request carries an
 * Origin, so any request with one is refused.
 */
export async function linkRoutes(ctx: ServiceContext, req: IncomingMessage, res: ServerResponse, path: string) {
  if (req.headers.origin) return reply.json(res, 403, { error: 'browsers_not_allowed' });
  const method = req.method ?? 'GET';
  if (path === '/link/preview' && method === 'POST') return previewLink(ctx, req, res);
  if (path === '/link' && method === 'POST') return createLink(ctx, req, res);
  if (path === '/link' && method === 'DELETE') return deleteLink(ctx, req, res);
  reply.json(res, 404, { error: 'not_found' });
}
