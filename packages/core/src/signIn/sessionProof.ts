import { createHmac } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { TLSSocket } from 'node:tls';
import { machineSign } from '../machine/machineKey';

/**
 * How the page knows it is talking to the Lookout before it sends its session. At pairing the page gets a verifier
 * for its session: the machine key's HMAC of the session id, which the server can always recompute and never sends
 * again. Later the page sends only the session id and a nonce (`POST /session/prove`, no secret) and checks the
 * answer, HMAC(verifier, nonce ‖ origin), against its own `location.origin`. A server squatting the port when the
 * Lookout isn't running doesn't know the verifier, so the page never sends it the session. The origin's port is
 * the one this socket really listens on, so a squatter relaying to a Lookout on another port gets a proof for the
 * wrong origin. The session id alone opens nothing.
 */
export const sessionVerifier = (sessionId: string, configDir?: string) =>
  machineSign(['session-verifier', sessionId], configDir);

/** The origin this request reached: the Host's name, and the port this socket listens on (never the header's). */
export function servedOrigin(req: IncomingMessage): string | undefined {
  const scheme = (req.socket as Partial<TLSSocket> | undefined)?.encrypted ? 'https' : 'http';
  const port = req.socket?.localPort;
  try {
    const name = new URL(`http://${req.headers.host ?? ''}`).hostname;
    return port ? new URL(`${scheme}://${name}:${port}`).origin : undefined;
  } catch {
    return undefined;
  }
}

/** The answer to a page's challenge: HMAC-SHA256 under the verifier of `nonce`, a newline and the origin. */
export const sessionProof = (verifier: string, nonce: string, origin: string) =>
  createHmac('sha256', Buffer.from(verifier, 'hex')).update(`${nonce}\n${origin}`, 'utf8').digest('hex');
