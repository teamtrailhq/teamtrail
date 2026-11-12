import type { IncomingMessage, ServerResponse } from 'node:http';
import { secrets } from '../crypto/secrets';
import { reply } from '../http/reply';
import type { ServiceContext } from '../serviceContext';

/** `DELETE /link` with the link token as a bearer: the Lookout disconnects; the link and its sockets go. */
export async function deleteLink(ctx: ServiceContext, req: IncomingMessage, res: ServerResponse) {
  const auth = String(req.headers.authorization ?? '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const link = token ? await ctx.store.linkByTokenHash(secrets.hash(token)) : undefined;
  if (!link) return reply.json(res, 401, { error: 'unknown_link' });
  await ctx.store.removeLink(link.id);
  ctx.hub.revoke([link.id], 'disconnected');
  ctx.log('link.deleted', { link: link.id });
  reply.empty(res, 204);
}
