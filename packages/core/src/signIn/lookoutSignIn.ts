import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SignInFile, SignInKind, SignInView, StoredSignIn } from '../model/signIn';
import { browserName } from './browserName';
import { pairAttempts } from './pairAttempts';
import { mintPairCode } from './pairCodes';
import { clearedCookie, cookieName, readCookie, sessionCookie } from './signInCookie';
import { findByHash, SESSION_SHAPE } from './signInSecrets';
import { burnPairCode, pairWithCode, removeSession, touchSessions } from './signInSessions';
import { readSignIns, type SignInPlace, signInsVersion } from './signInStore';

export interface LookoutSignInOptions extends SignInPlace {
  /** The addresses other devices reach this Lookout at (`http://192.168.1.5:7420/`); none when it listens on loopback only. */
  lanUrls?: () => string[];
  now?: () => number;
  /** How often open event streams are checked against the file (a session revoked or expired elsewhere). */
  sweepMs?: number;
}

export type SignInCheck =
  { kind: 'signed-in'; session: StoredSignIn; renew?: string } | { kind: 'signed-out' } | { kind: 'ambiguous' };

export type PairOutcome =
  | { kind: 'paired'; session: StoredSignIn; cookie: string }
  | { kind: 'already'; session: StoredSignIn }
  | { kind: 'refused' }
  | { kind: 'locked'; until: number };

/** Last use is recorded to the minute: one small write per browser per minute at most. */
const USE_RESOLUTION_MS = 60_000;

/**
 * Sign-in for one Lookout: who a request is (its session cookie), pairing with a one-time code, and the paired
 * browsers Settings lists and revokes. State lives in the machine store (signInStore.ts), read again whenever it
 * changed, so a code `teamtrail pair` adds works at once. Event streams are held per session and end when it does.
 */
export function createLookoutSignIn(o: LookoutSignInOptions) {
  const place: SignInPlace = { root: o.root, configDir: o.configDir };
  const now = o.now ?? Date.now;
  const name = cookieName(o.root);
  const attempts = pairAttempts();
  const streams = new Map<string, Set<ServerResponse>>();
  let cache: { at: string; file: SignInFile } = { at: '', file: { v: 1, sessions: [], codes: [] } };

  const current = (): SignInFile => {
    const at = signInsVersion(place);
    if (at !== cache.at) cache = { at, file: readSignIns(place) };
    return cache.file;
  };
  const live = () => current().sessions.filter((s) => s.expiresAt > now());

  /** The session a cookie value opens. */
  const sessionOf = (value: string) => (SESSION_SHAPE.test(value) ? findByHash(live(), value) : undefined);

  function check(req: IncomingMessage): SignInCheck {
    const cookie = readCookie(req, name);
    if (cookie.kind === 'ambiguous') return cookie;
    const session = cookie.kind === 'one' ? sessionOf(cookie.value) : undefined;
    if (!session || cookie.kind !== 'one') return { kind: 'signed-out' };
    const t = now();
    if (t - session.lastUsedAt < USE_RESOLUTION_MS) return { kind: 'signed-in', session };
    touchSessions({ ...place, used: new Map([[session.id, t]]) });
    // Each recorded use moves the expiry forward, in the browser too.
    return { kind: 'signed-in', session, renew: sessionCookie(req, { name, value: cookie.value }) };
  }

  function pair(req: IncomingMessage, at: { code: unknown; local: boolean }): PairOutcome {
    const until = attempts.lockedUntil(now());
    if (until) return { kind: 'locked', until };
    const signedIn = check(req);
    if (signedIn.kind === 'signed-in') {
      // Another link opened in a browser already paired: the code is spent, the browser keeps its session.
      burnPairCode({ ...place, code: at.code });
      return { kind: 'already', session: signedIn.session };
    }
    const done = pairWithCode({
      ...place,
      code: at.code,
      local: at.local,
      name: browserName(req.headers['user-agent']),
      now: now(),
    });
    if (done.kind === 'refused') return (attempts.failed(now()), done);
    return { kind: 'paired', session: done.session, cookie: sessionCookie(req, { name, value: done.secret }) };
  }

  function endStreams(id: string) {
    for (const res of streams.get(id) ?? []) res.end();
    streams.delete(id);
  }

  const sweep = setInterval(() => {
    const ids = new Set(live().map((s) => s.id));
    for (const id of [...streams.keys()]) if (!ids.has(id)) endStreams(id);
  }, o.sweepMs ?? 5_000);
  sweep.unref?.();

  return {
    root: o.root,
    cookieName: name,
    check,
    pair,
    mintCode: (kind: SignInKind) => mintPairCode({ ...place, kind, now: now() }),
    lanUrls: () => o.lanUrls?.() ?? [],
    views: (currentId?: string): SignInView[] =>
      live()
        // this browser first, then the one used most recently
        .sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId) || b.lastUsedAt - a.lastUsedAt)
        .map(({ id, name: n, kind, pairedAt, lastUsedAt }) => ({
          id,
          name: n,
          kind,
          pairedAt,
          lastUsedAt,
          current: id === currentId,
        })),
    /** Ends a session and its event streams; the removed one, or undefined when the id is unknown. */
    revoke(id: string) {
      const gone = removeSession({ ...place, id });
      if (gone) endStreams(id);
      return gone;
    },
    signedOutCookie: (req: IncomingMessage) => clearedCookie(req, name),
    /** Keeps an event stream with its session, so revoking the session ends it. */
    holdStream(id: string, req: IncomingMessage, res: ServerResponse) {
      const set = streams.get(id) ?? new Set();
      streams.set(id, set.add(res));
      req.on('close', () => set.delete(res));
    },
    close() {
      clearInterval(sweep);
      for (const id of [...streams.keys()]) endStreams(id);
    },
  };
}

export type LookoutSignIn = ReturnType<typeof createLookoutSignIn>;
