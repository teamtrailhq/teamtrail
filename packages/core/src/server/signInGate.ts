import type { IncomingMessage, ServerResponse } from 'node:http';
import type { StoredSignIn } from '../model/signIn';
import { handlePublicSignIn, type PublicSignInContext } from './signInPublicRoutes';

/** What a request without a session is told; the page shows "Pair this browser" on `signIn`. */
export const NOT_SIGNED_IN = 'Pair this browser first: run `teamtrail pair` on the machine Teamtrail runs on.';

/**
 * The sign-in check in front of every API route: answers the pairing routes itself, refuses a request without a
 * live session with 401 (closing the connection, so an unread body is never read as the next request), and
 * returns the session of everything else. The session comes from the `X-Teamtrail-Session` header; an event stream
 * (`route` `/events`) shows a single-use ticket instead, since EventSource sends no headers. undefined when the
 * request was answered here.
 */
export async function signInGate(
  ctx: PublicSignInContext & { route: string },
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<StoredSignIn | undefined> {
  if (await handlePublicSignIn(ctx, req, res, url)) return undefined;
  const stream = ctx.route === '/events' && url.searchParams.has('ticket');
  const who = stream ? ctx.signIn.checkTicket(url.searchParams.get('ticket')) : ctx.signIn.check(req);
  if (who.kind === 'signed-in') return who.session;
  res.setHeader('Connection', 'close');
  res.statusCode = 401;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: NOT_SIGNED_IN, signIn: 'required' }));
  return undefined;
}
