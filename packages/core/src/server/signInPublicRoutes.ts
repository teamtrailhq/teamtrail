import type { IncomingMessage, ServerResponse } from 'node:http';
import type { LookoutSignIn, PairOutcome } from '../signIn/lookoutSignIn';
import { journalSignIn } from '../signIn/signInJournal';
import { readJson, sendJson } from './http';
import { crossSite } from './trackerErrors';

export interface PublicSignInContext {
  signIn: LookoutSignIn;
  /** The request comes from this machine (socket address). */
  local: boolean;
  /** The id of the project the Lookout was started in. */
  homeId: string;
}

/** Where the page goes after a pairing link: the Lookout, maybe with a Settings page (`?settings=slack`). */
const NEXT = /^\?[\w=&-]{0,100}$/;

const LOCKED = 'Too many wrong codes. Wait a minute, then try again.';
const REFUSED = 'That code was already used, has expired, or is wrong. Get a new one.';

function redirect(res: ServerResponse, to: string, cookie?: string) {
  if (cookie) res.setHeader('Set-Cookie', cookie);
  res.statusCode = 303;
  res.setHeader('Location', to);
  res.end();
}

function afterLink(res: ServerResponse, done: PairOutcome, next: string) {
  switch (done.kind) {
    case 'paired':
      return redirect(res, `/${next}`, done.cookie);
    case 'already':
      return redirect(res, `/${next}`);
    case 'refused':
      return redirect(res, '/?pair=used');
    case 'locked':
      return redirect(res, '/?pair=wait');
    default: {
      const never: never = done;
      return never;
    }
  }
}

function afterTyped(res: ServerResponse, done: PairOutcome) {
  switch (done.kind) {
    case 'paired':
      res.setHeader('Set-Cookie', done.cookie);
      return sendJson(res, 200, { ok: true, kind: done.session.kind });
    case 'already':
      return sendJson(res, 200, { ok: true, kind: done.session.kind });
    case 'refused':
      return sendJson(res, 400, { error: REFUSED });
    case 'locked':
      res.setHeader('Retry-After', String(Math.ceil((done.until - Date.now()) / 1000)));
      return sendJson(res, 429, { error: LOCKED });
    default: {
      const never: never = done;
      return never;
    }
  }
}

/**
 * The only API routes a browser reaches before it is paired:
 *   GET  /session              `{ signedIn, local, kind?, project, ambiguous? }`: whether this browser is signed in
 *   GET  /pair?code=…[&next=…] the link `teamtrail` and `teamtrail pair` print, or a QR code: signs the browser in
 *                              and sends it on to the Lookout (303), so the code leaves the address bar
 *   POST /pair                 body `{ code }`: a code typed on the pairing page
 * A code works once, whatever happens; wrong ones are counted (signIn/pairAttempts.ts). False for any other path.
 */
export async function handlePublicSignIn(
  ctx: PublicSignInContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) {
  const { signIn } = ctx;
  if (url.pathname === '/session' && req.method === 'GET') {
    const who = signIn.check(req);
    const session = who.kind === 'signed-in' ? { kind: who.session.kind } : {};
    const ambiguous = who.kind === 'ambiguous' ? { ambiguous: true } : {};
    if (who.kind === 'signed-in' && who.renew) res.setHeader('Set-Cookie', who.renew);
    sendJson(res, 200, {
      signedIn: who.kind === 'signed-in',
      local: ctx.local,
      project: ctx.homeId,
      ...session,
      ...ambiguous,
    });
    return true;
  }
  if (url.pathname !== '/pair') return false;
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'GET') {
    const done = signIn.pair(req, { code: url.searchParams.get('code'), local: ctx.local });
    if (done.kind === 'paired') journalSignIn(signIn.root, 'paired', done.session);
    const next = url.searchParams.get('next') ?? '';
    afterLink(res, done, NEXT.test(next) ? next : '');
    return true;
  }
  if (req.method !== 'POST') return false;
  if (crossSite(req)) return (sendJson(res, 403, { error: 'cross-site request refused' }), true);
  const body = await readJson<{ code?: unknown }>(req, '{}');
  const done = signIn.pair(req, { code: body.code, local: ctx.local });
  if (done.kind === 'paired') journalSignIn(signIn.root, 'paired', done.session);
  afterTyped(res, done);
  return true;
}
