import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SignInFile, SignInKind, SignInView, StoredSignIn } from '../model/signIn';
import { browserName } from './browserName';
import { pairAttempts } from './pairAttempts';
import { mintPairCode, normalizePairCode } from './pairCodes';
import { servedOrigin, sessionProof, sessionVerifier } from './sessionProof';
import { sessionOf } from './signInHeader';
import { findByHash, SESSION_SHAPE } from './signInSecrets';
import { burnPairCode, pairWithCode, removeSession, touchSessions } from './signInSessions';
import { readSignIns, type SignInPlace, signInsVersion } from './signInStore';
import { streamTickets } from './streamTickets';
import { sweepSignInRedirects } from './sweepSignInRedirects';

export interface LookoutSignInOptions extends SignInPlace {
  /** The addresses other devices reach this Lookout at (`http://192.168.1.5:7420/`); none when it listens on loopback only. */
  lanUrls?: () => string[];
  now?: () => number;
  /** How often open event streams are checked against the file (a session revoked or expired elsewhere). */
  sweepMs?: number;
  /** This Lookout's process id: the only codes it takes are the ones made for it. Default `process.pid`. */
  instance?: number;
}

export type SignInCheck = { kind: 'signed-in'; session: StoredSignIn } | { kind: 'signed-out' };

export type PairOutcome =
  | { kind: 'paired'; session: StoredSignIn; secret: string; verifier: string }
  | { kind: 'already'; session: StoredSignIn }
  | { kind: 'refused' }
  | { kind: 'locked'; until: number };

/** Last use is recorded to the minute: one small write per browser per minute at most. */
const USE_RESOLUTION_MS = 60_000;

/**
 * Sign-in for one Lookout: who a request is (its session header, or a stream ticket), pairing with a one-time code,
 * and the paired browsers Settings lists and revokes. State lives in the machine store (signInStore.ts), read again
 * whenever it changed, so a code `teamtrail pair` adds works at once. Event streams are held per session and end
 * when it does.
 */
export function createLookoutSignIn(o: LookoutSignInOptions) {
  const place: SignInPlace = { root: o.root, configDir: o.configDir };
  const now = o.now ?? Date.now;
  const instance = o.instance ?? process.pid;
  // This start: sessions paired now work until this Lookout stops, never for a later one.
  const start = randomBytes(16).toString('hex');
  const attempts = pairAttempts();
  const tickets = streamTickets(now);
  const streams = new Map<string, Set<ServerResponse>>();
  let cache: { at: string; file: SignInFile } = { at: '', file: { v: 1, sessions: [], codes: [] } };
  // The one-time pages that open a browser on a link: a stopped Lookout's are stale; ours go once used or expired.
  sweepSignInRedirects({ ...place, keep: 'none' });
  const sweepPages = () => sweepSignInRedirects({ ...place, keep: 'pending', now: now() });

  const current = (): SignInFile => {
    const at = signInsVersion(place);
    if (at !== cache.at) cache = { at, file: readSignIns(place) };
    return cache.file;
  };
  const live = () => current().sessions.filter((s) => s.start === start && s.expiresAt > now());

  /** Records a use (to the minute), which moves the session's expiry forward. */
  const used = (session: StoredSignIn) => {
    const t = now();
    if (t - session.lastUsedAt >= USE_RESOLUTION_MS) touchSessions({ ...place, used: new Map([[session.id, t]]) });
    return session;
  };

  function check(req: IncomingMessage): SignInCheck {
    const value = sessionOf(req);
    const session = value && SESSION_SHAPE.test(value) ? findByHash(live(), value) : undefined;
    return session ? { kind: 'signed-in', session: used(session) } : { kind: 'signed-out' };
  }

  /** The session an event stream's ticket was made for (`/events?ticket=`), used once. */
  function checkTicket(ticket: string | null): SignInCheck {
    const id = tickets.take(ticket);
    const session = id ? live().find((s) => s.id === id) : undefined;
    return session ? { kind: 'signed-in', session } : { kind: 'signed-out' };
  }

  /** `who`: the caller, for the wrong-code budget (`loopback`, or another device's address). */
  function pair(req: IncomingMessage, at: { code: unknown; local: boolean; who: string }): PairOutcome {
    const shape = normalizePairCode(at.code);
    // Empty or malformed: no code, refused, and counted against no one.
    if (!shape) return { kind: 'refused' };
    const until = shape.kind === 'typed' ? attempts.lockedUntil(at.who, now()) : undefined;
    if (until) return { kind: 'locked', until };
    const signedIn = check(req);
    if (signedIn.kind === 'signed-in') {
      // A browser already signed in: the code is spent, the browser keeps its session (nothing is overwritten).
      burnPairCode({ ...place, code: at.code });
      sweepPages();
      return { kind: 'already', session: signedIn.session };
    }
    const name = browserName(req.headers['user-agent']);
    const done = pairWithCode({ ...place, code: at.code, local: at.local, name, instance, start, now: now() });
    if (done.kind === 'paired') {
      sweepPages();
      return { ...done, verifier: sessionVerifier(done.session.id, o.configDir) };
    }
    if (shape.kind === 'typed') attempts.failed(at.who, now());
    return done;
  }

  /**
   * The page's check that this is its Lookout (sessionProof.ts): the proof for a live session's id and a nonce, at
   * the origin this request reached; undefined for a session this start doesn't have.
   */
  function prove(req: IncomingMessage, at: { id?: unknown; nonce?: unknown }) {
    const session = typeof at.id === 'string' ? live().find((s) => s.id === at.id) : undefined;
    const origin = servedOrigin(req);
    const nonce = typeof at.nonce === 'string' && /^[0-9a-f]{32,128}$/.test(at.nonce) ? at.nonce : undefined;
    if (!session || !origin || !nonce) return undefined;
    return sessionProof(sessionVerifier(session.id, o.configDir), nonce, origin);
  }

  function endStreams(id: string) {
    for (const res of streams.get(id) ?? []) res.end();
    streams.delete(id);
  }

  const sweep = setInterval(() => {
    const ids = new Set(live().map((s) => s.id));
    for (const id of [...streams.keys()]) if (!ids.has(id)) endStreams(id);
    sweepPages();
  }, o.sweepMs ?? 5_000);
  sweep.unref?.();

  return {
    root: o.root,
    instance,
    check,
    checkTicket,
    pair,
    prove,
    streamTicket: (session: StoredSignIn) => tickets.issue(session.id),
    mintCode: (kind: SignInKind) => mintPairCode({ ...place, kind, instance, now: now() }),
    lanUrls: () => o.lanUrls?.() ?? [],
    views: (currentId?: string): SignInView[] =>
      live()
        // this browser first, then the one used most recently
        .sort((a, b) => Number(b.id === currentId) - Number(a.id === currentId) || b.lastUsedAt - a.lastUsedAt)
        .map(({ id, name, kind, pairedAt, lastUsedAt }) => ({
          ...{ id, name, kind, pairedAt, lastUsedAt },
          current: id === currentId,
        })),
    /** Ends a session and its event streams; the removed one, or undefined when the id is unknown. */
    revoke(id: string) {
      const gone = removeSession({ ...place, id });
      if (gone) endStreams(id);
      return gone;
    },
    /** Keeps an event stream with its session, so revoking the session ends it. */
    holdStream(id: string, req: IncomingMessage, res: ServerResponse) {
      const set = streams.get(id) ?? new Set();
      streams.set(id, set.add(res));
      req.on('close', () => set.delete(res));
    },
    close() {
      clearInterval(sweep);
      sweepSignInRedirects({ ...place, keep: 'none' });
      for (const id of [...streams.keys()]) endStreams(id);
    },
  };
}

export type LookoutSignIn = ReturnType<typeof createLookoutSignIn>;
