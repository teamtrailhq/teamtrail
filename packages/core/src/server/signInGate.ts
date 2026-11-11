import type { IncomingMessage, ServerResponse } from 'node:http';
import type { StoredSignIn } from '../model/signIn';
import { handlePublicSignIn, type PublicSignInContext } from './signInPublicRoutes';

/** What a request without a session is told; the page shows "Pair this browser" on `signIn`. */
export const NOT_SIGNED_IN = 'Pair this browser first: run `teamtrail pair` on the machine Teamtrail runs on.';
const AMBIGUOUS =
  'This browser sends two sign-in cookies for this Lookout (another app on localhost may have set one). Clear the site data for this address, then pair again.';

/**
 * The sign-in check in front of every API route: answers the pairing routes itself, refuses a request without a
 * live session with 401 (closing the connection, so an unread body is never read as the next request), and
 * returns the session of everything else. undefined when the request was answered here.
 */
export async function signInGate(
  ctx: PublicSignInContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<StoredSignIn | undefined> {
  if (await handlePublicSignIn(ctx, req, res, url)) return undefined;
  const who = ctx.signIn.check(req);
  if (who.kind === 'signed-in') {
    if (who.renew) res.setHeader('Set-Cookie', who.renew);
    return who.session;
  }
  res.setHeader('Connection', 'close');
  res.statusCode = 401;
  res.setHeader('Content-Type', 'application/json');
  const ambiguous = who.kind === 'ambiguous';
  res.end(
    JSON.stringify({ error: ambiguous ? AMBIGUOUS : NOT_SIGNED_IN, signIn: ambiguous ? 'ambiguous' : 'required' }),
  );
  return undefined;
}
