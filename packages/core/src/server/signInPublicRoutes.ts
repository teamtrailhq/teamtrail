import type { IncomingMessage, ServerResponse } from 'node:http';
import { instanceProof, NONCE_SHAPE } from '../signIn/instanceProof';
import type { LookoutSignIn, PairOutcome } from '../signIn/lookoutSignIn';
import { journalSignIn } from '../signIn/signInJournal';
import { readJson, sendJson } from './http';
import { crossSite } from './trackerErrors';

export interface PublicSignInContext {
  signIn: LookoutSignIn;
  /** The request comes from this machine (socket address). */
  local: boolean;
  /** Who is asking, for the wrong-code budget: `loopback`, or the other device's address. */
  who: string;
  /** The id of the project the Lookout was started in. */
  homeId: string;
}

const LOCKED = 'Too many wrong codes from here. Wait a minute, then try again.';
const REFUSED = 'That code was already used, has expired, or is wrong. Get a new one.';

function afterPair(res: ServerResponse, done: PairOutcome) {
  switch (done.kind) {
    case 'paired':
      // The only time the session and its verifier leave the server: the page keeps them in its own origin's storage.
      return sendJson(res, 200, {
        ...{ ok: true, kind: done.session.kind, id: done.session.id },
        ...{ session: done.secret, verifier: done.verifier },
      });
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

/** `POST /session/prove`: body `{ id, nonce }` → `{ proof }`, or 404 for a session this Lookout start doesn't have. */
async function prove(ctx: PublicSignInContext, req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const body = await readJson<{ id?: unknown; nonce?: unknown }>(req, '{}');
  const proof = ctx.signIn.prove(req, body);
  if (!proof) return sendJson(res, 404, { error: 'unknown session' });
  sendJson(res, 200, { proof });
}

/** `GET /session`: whether this browser is signed in; this machine also learns the project, and a nonce's proof. */
function session(ctx: PublicSignInContext, req: IncomingMessage, res: ServerResponse, url: URL) {
  const who = ctx.signIn.check(req);
  const signedIn = who.kind === 'signed-in';
  const kind = signedIn ? { kind: who.session.kind } : {};
  // Which repo this is, only to this machine or a paired browser: not to anyone on the network.
  const project = ctx.local || signedIn ? { project: ctx.homeId } : {};
  const nonce = url.searchParams.get('nonce');
  const sig =
    ctx.local && nonce && NONCE_SHAPE.test(nonce)
      ? instanceProof(ctx.signIn.root, ctx.signIn.instance, nonce)
      : undefined;
  const proof = sig ? { instance: ctx.signIn.instance, proof: sig } : {};
  sendJson(res, 200, { signedIn, local: ctx.local, ...kind, ...project, ...proof });
}

/**
 * The only API routes a browser reaches before it is paired:
 *   GET  /session[?nonce=]  `{ signedIn, local, kind?, project?, instance?, proof? }`: whether the browser asking is
 *                           signed in. `project` only to this machine or a paired browser; with a nonce, this machine
 *                           also gets the Lookout's process id and the machine key's signature of it and the nonce,
 *                           which is how `teamtrail pair` knows the server at the lock's URL is this very Lookout.
 *   POST /session/prove     body `{ id, nonce }` → `{ proof }`: the page's check, before it sends its session, that
 *                           this server is its Lookout (signIn/sessionProof.ts). No secret goes in.
 *   POST /pair              body `{ code }` from the Lookout's own page (a link's code from its `#pair=` fragment,
 *                           after a click, or a typed one) → `{ ok, kind, id?, session?, verifier? }`; Origin required
 * A code works once, whatever happens; wrong typed codes are counted per caller (signIn/pairAttempts.ts). Pairing is
 * a POST from the Lookout's own origin only (the Origin check, JSON): no link or other site completes it. False for
 * any other path.
 */
export async function handlePublicSignIn(
  ctx: PublicSignInContext,
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
) {
  if (url.pathname === '/session' && req.method === 'GET') return (session(ctx, req, res, url), true);
  if (url.pathname === '/session/prove' && req.method === 'POST') return (await prove(ctx, req, res), true);
  if (url.pathname !== '/pair' || req.method !== 'POST') return false;
  res.setHeader('Cache-Control', 'no-store');
  // A browser always sends Origin with a POST, and requestGuard.ts has checked it is this server's own. A request
  // without one is no page of the Lookout's: a program on this machine that read a code somewhere.
  if (!req.headers.origin || crossSite(req))
    return (sendJson(res, 403, { error: 'pairing is done from the Lookout page' }), true);
  const body = await readJson<{ code?: unknown }>(req, '{}');
  const done = ctx.signIn.pair(req, { code: body.code, local: ctx.local, who: ctx.who });
  if (done.kind === 'paired') journalSignIn(ctx.signIn.root, 'paired', done.session);
  afterPair(res, done);
  return true;
}
