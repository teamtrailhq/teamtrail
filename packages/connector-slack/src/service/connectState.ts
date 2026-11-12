import { createHash, randomBytes } from 'node:crypto';

/** Add Scout to Slack, started from this machine and waiting for the browser to come back. Memory only. */
export interface PendingConnect {
  /** The PKCE verifier: only this process has it, so the code the browser brings back is useless to anyone else. */
  verifier: string;
  expiresAt: number;
}

/** How long the browser has to go through Slack's consent screen and come back. */
export const CONNECT_TTL_MS = 10 * 60_000;

/** A code from the service, as it makes them: 256 bits, base64url. */
export const LINK_CODE = /^[A-Za-z0-9_-]{43}$/;

/** A new verifier (256 bits, base64url) and its S256 challenge. */
export function pkce(now: number): { pending: PendingConnect; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { pending: { verifier, expiresAt: now + CONNECT_TTL_MS }, challenge };
}

/**
 * Where the service sends the browser back to: this Lookout, on 127.0.0.1 at the port the request came in on (or
 * the Lookout's own address), at Settings → Slack of the project the connect was started in. Never `localhost` (a hosts file can point it anywhere), and the
 * service accepts nothing else.
 */
export function returnAddress(o: { port?: number; lookoutUrl?: string; project?: string }): string | undefined {
  const port = o.port ?? portOf(o.lookoutUrl);
  if (!port) return undefined;
  // a connect started in another project of this Lookout finishes on that project's bridge
  const project = o.project && PROJECT_ID.test(o.project) ? `project=${o.project}&` : '';
  return `http://127.0.0.1:${port}/?${project}settings=slack`;
}

/** A project id as the Lookout's projects hub hands them out: a short hex hash. */
const PROJECT_ID = /^[0-9a-f]{6,64}$/;

function portOf(lookoutUrl: string | undefined) {
  if (!lookoutUrl) return undefined;
  try {
    const url = new URL(lookoutUrl);
    return url.protocol === 'http:' && url.port ? Number(url.port) : undefined;
  } catch {
    return undefined;
  }
}
