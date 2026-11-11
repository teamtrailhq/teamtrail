import { randomBytes } from 'node:crypto';
import type { SignInKind, StoredSignIn } from '../model/signIn';
import { normalizePairCode } from './pairCodes';
import { findByHash, newSessionSecret, secretHash } from './signInSecrets';
import { type SignInPlace, updateSignIns } from './signInStore';

/** A paired browser stays signed in until 30 days after it was last used, or until it is revoked. */
export const SESSION_MS = 30 * 24 * 60 * 60_000;
/** Paired browsers kept at once; past that the one used longest ago goes. */
const MAX_SESSIONS = 50;

export type PairResult = { kind: 'paired'; secret: string; session: StoredSignIn } | { kind: 'refused' };

/**
 * Uses a pairing code, once: the code is gone whatever happens next. A good one opens a new session. `local` is
 * whether the browser pairing is on this machine; only then does a `machine` code give a `machine` session.
 */
export function pairWithCode(
  at: SignInPlace & { code: unknown; name: string; local: boolean; now?: number },
): PairResult {
  const now = at.now ?? Date.now();
  const code = normalizePairCode(at.code);
  return updateSignIns<PairResult>(at, (file) => {
    const codes = file.codes.filter((c) => c.expiresAt > now);
    const used = code ? findByHash(codes, code) : undefined;
    const rest = codes.filter((c) => c !== used);
    if (!used) return { file: { ...file, codes: rest }, result: { kind: 'refused' } };
    const kind: SignInKind = used.kind === 'machine' && at.local ? 'machine' : 'device';
    const secret = newSessionSecret();
    const session: StoredSignIn = {
      id: `si_${randomBytes(6).toString('hex')}`,
      name: at.name,
      hash: secretHash(secret),
      kind,
      pairedAt: now,
      lastUsedAt: now,
      expiresAt: now + SESSION_MS,
    };
    const live = file.sessions.filter((s) => s.expiresAt > now).sort((a, b) => a.lastUsedAt - b.lastUsedAt);
    const sessions = [...live, session].slice(-MAX_SESSIONS);
    return { file: { v: 1, sessions, codes: rest }, result: { kind: 'paired', secret, session } };
  });
}

/** Burns a code without opening a session: a browser that is already signed in opened another link. */
export function burnPairCode(at: SignInPlace & { code: unknown }) {
  const code = normalizePairCode(at.code);
  if (!code) return;
  updateSignIns(at, (file) => {
    const used = findByHash(file.codes, code);
    return { file: { ...file, codes: file.codes.filter((c) => c !== used) }, result: undefined };
  });
}

/** Removes a session; the removed one, or undefined when the id is unknown. */
export function removeSession(at: SignInPlace & { id: string }): StoredSignIn | undefined {
  return updateSignIns(at, (file) => {
    const gone = file.sessions.find((s) => s.id === at.id);
    return { file: { ...file, sessions: file.sessions.filter((s) => s !== gone) }, result: gone };
  });
}

/** Records that sessions were used, and moves their expiry forward: `used` maps a session id to when. */
export function touchSessions(at: SignInPlace & { used: Map<string, number> }) {
  if (!at.used.size) return;
  updateSignIns(at, (file) => {
    const sessions = file.sessions.map((s) => {
      const when = at.used.get(s.id);
      return when && when > s.lastUsedAt ? { ...s, lastUsedAt: when, expiresAt: when + SESSION_MS } : s;
    });
    return { file: { ...file, sessions }, result: undefined };
  });
}
