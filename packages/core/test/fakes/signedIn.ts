import type { IncomingMessage } from 'node:http';
import { createLookoutSignIn, type LookoutSignIn } from '../../src/signIn/lookoutSignIn';

const fakeRequest = (headers: Record<string, string> = {}) => ({ headers, socket: {} }) as unknown as IncomingMessage;

/** A browser paired with `signIn` (on this machine, unless `local: false`): its `Cookie` header value. */
export function pairCookie(signIn: LookoutSignIn, o: { local?: boolean; userAgent?: string } = {}): string {
  const kind = o.local === false ? 'device' : 'machine';
  const { code } = signIn.mintCode(kind);
  const done = signIn.pair(fakeRequest(o.userAgent ? { 'user-agent': o.userAgent } : {}), {
    code,
    local: o.local !== false,
  });
  if (done.kind !== 'paired') throw new Error(`pairing failed: ${done.kind}`);
  return done.cookie.split(';')[0];
}

/**
 * The Lookout's sign-in for a test hub, with one browser already paired on this machine: pass `signIn` to
 * createProjectsHub and send `cookie` as the `Cookie` header. Kept in the test's own config dir.
 */
export function pairedSignIn(o: { root: string; configDir: string }) {
  const signIn = createLookoutSignIn(o);
  return { signIn, cookie: pairCookie(signIn) };
}
