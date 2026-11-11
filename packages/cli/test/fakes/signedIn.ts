import type { IncomingMessage } from 'node:http';
import { createLookoutSignIn } from '@teamtrail/core/bridge';

/**
 * The Lookout's sign-in for a test server, with one browser already paired on this machine: pass `signIn` to
 * createProjectsHub and send `cookie` as the `Cookie` header.
 */
export function pairedSignIn(o: { root: string; configDir: string }) {
  const signIn = createLookoutSignIn(o);
  const { code } = signIn.mintCode('machine');
  const done = signIn.pair({ headers: {}, socket: {} } as unknown as IncomingMessage, { code, local: true });
  if (done.kind !== 'paired') throw new Error(`pairing failed: ${done.kind}`);
  return { signIn, cookie: done.cookie.split(';')[0] };
}
