import type { IncomingMessage, ServerResponse } from 'node:http';
import type { StoredSignIn } from '../model/signIn';
import type { LookoutSignIn } from '../signIn/lookoutSignIn';
import { journalSignIn } from '../signIn/signInJournal';
import { BadRequest, readJson, sendJson } from './http';
import { crossSite } from './trackerErrors';

export interface SignInContext {
  signIn: LookoutSignIn;
  /** The session of the browser asking. */
  session: StoredSignIn;
}

/** The Lookout's page with the code in the fragment, which no server, log or Referer ever gets. */
const pairLink = (base: string, code: string) => `${base.replace(/\/?$/, '/')}#pair=${code}`;

/**
 * `/sign-in`: the paired browsers (Settings → You → Browsers & devices). Listing, pairing another device and
 * revoking are this machine's (server/thisMachineRoutes.ts); signing yourself out is anyone's.
 *   GET  /sign-in/sessions   `{ sessions: SignInView[], lan: string[] }`
 *   POST /sign-in/codes      → `{ code, expiresAt, links }`: a short code for another device, and the links that use it
 *   POST /sign-in/revoke     body `{ id }` → `{ sessions }`; that browser is signed out and its event streams end
 *   POST /sign-in/stream     → `{ ticket }`: opens one `/events?ticket=` stream within 30 s (EventSource sends no headers)
 *   POST /sign-in/sign-out   this browser: its session ends
 * False when the path doesn't match.
 */
export async function handleSignIn(ctx: SignInContext, req: IncomingMessage, res: ServerResponse, url: URL) {
  if (!url.pathname.startsWith('/sign-in/')) return false;
  if (crossSite(req)) return (sendJson(res, 403, { error: 'cross-site request refused' }), true);
  res.setHeader('Cache-Control', 'no-store');
  const { signIn, session } = ctx;
  const sessions = () => signIn.views(session.id);
  const route = `${req.method} ${url.pathname}`;
  if (route === 'GET /sign-in/sessions')
    return (sendJson(res, 200, { sessions: sessions(), lan: signIn.lanUrls() }), true);
  if (route === 'POST /sign-in/codes') {
    const { code, expiresAt } = signIn.mintCode('device');
    journalSignIn(signIn.root, 'device-code');
    const links = signIn.lanUrls().map((base) => pairLink(base, code.replace('-', '')));
    return (sendJson(res, 200, { code, expiresAt, links }), true);
  }
  if (route === 'POST /sign-in/revoke') {
    const body = await readJson<{ id?: unknown }>(req, '{}');
    if (typeof body.id !== 'string') throw new BadRequest('"id" is required');
    const gone = signIn.revoke(body.id);
    if (!gone) return (sendJson(res, 404, { error: 'no such browser', sessions: sessions() }), true);
    journalSignIn(signIn.root, 'revoked', gone);
    return (sendJson(res, 200, { sessions: sessions() }), true);
  }
  if (route === 'POST /sign-in/stream') return (sendJson(res, 200, { ticket: signIn.streamTicket(session) }), true);
  if (route === 'POST /sign-in/sign-out') {
    const gone = signIn.revoke(session.id);
    if (gone) journalSignIn(signIn.root, 'signed-out', gone);
    return (sendJson(res, 200, { ok: true }), true);
  }
  return false;
}
