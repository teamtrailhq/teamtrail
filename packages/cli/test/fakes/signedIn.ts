import type { IncomingMessage } from 'node:http';
import { createLookoutSignIn } from '@teamtrail/core/bridge';

/**
 * The Lookout's sign-in for a test server, with one browser already paired on this machine: pass `signIn` to
 * createProjectsHub and send `header` with each request, as the Lookout's page does.
 */
export function pairedSignIn(o: { root: string; configDir: string }) {
  const signIn = createLookoutSignIn(o);
  const { code } = signIn.mintCode('machine');
  const req = { headers: {}, socket: {} } as unknown as IncomingMessage;
  const done = signIn.pair(req, { code, local: true, who: 'loopback' });
  if (done.kind !== 'paired') throw new Error(`pairing failed: ${done.kind}`);
  return { signIn, header: { 'X-Teamtrail-Session': done.secret } };
}
