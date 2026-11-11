import type { IncomingMessage } from 'node:http';
import { createLookoutSignIn, type LookoutSignIn } from '../../src/signIn/lookoutSignIn';

const fakeRequest = (headers: Record<string, string> = {}) => ({ headers, socket: {} }) as unknown as IncomingMessage;

/** A browser paired with `signIn` (on this machine, unless `local: false`): the session it sends. */
export function pairSession(signIn: LookoutSignIn, o: { local?: boolean; userAgent?: string } = {}): string {
  const kind = o.local === false ? 'device' : 'machine';
  const { code } = signIn.mintCode(kind);
  const done = signIn.pair(fakeRequest(o.userAgent ? { 'user-agent': o.userAgent } : {}), {
    code,
    local: o.local !== false,
    who: o.local === false ? '192.168.1.20' : 'loopback',
  });
  if (done.kind !== 'paired') throw new Error(`pairing failed: ${done.kind}`);
  return done.secret;
}

/** The header a paired browser's page sends with every API call. */
export const sessionHeader = (secret: string) => ({ 'X-Teamtrail-Session': secret });

/**
 * The Lookout's sign-in for a test hub, with one browser already paired on this machine: pass `signIn` to
 * createProjectsHub and send `header` with each request. Kept in the test's own config dir.
 */
export function pairedSignIn(o: { root: string; configDir: string }) {
  const signIn = createLookoutSignIn(o);
  return { signIn, header: sessionHeader(pairSession(signIn)) };
}
