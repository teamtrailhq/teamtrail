import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';

/** A Host header's host name, lower-cased, without port or IPv6 brackets; undefined when it doesn't parse. */
function hostName(host: string | undefined) {
  // Only `name[:port]` or `[ipv6][:port]`: nothing a URL parser could read as credentials or a path.
  if (!host || !/^([\w.-]+|\[[0-9a-f:.]+\])(:\d+)?$/i.test(host)) return undefined;
  try {
    return new URL(`http://${host}`).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return undefined;
  }
}

/**
 * Why a request is refused before its token is even looked at, or undefined when it may go on. This is what
 * stops a web page from reaching the endpoint through DNS rebinding:
 * - `Host` must be an IP address, `localhost`, or a name the server was told to answer to (`--allow-host`).
 *   A rebinding page always arrives with its own domain as the host, never an IP address.
 * - A request with an `Origin` (a browser) must come from the endpoint's own origin. No CORS header is ever
 *   sent, so pages on other origins can't read a response either.
 */
export function requestRefusal(req: IncomingMessage, allowedHosts: string[] = []): string | undefined {
  const host = hostName(req.headers.host);
  const allowed = new Set(['localhost', ...allowedHosts.map((h) => h.toLowerCase())]);
  if (!host || !(isIP(host) || allowed.has(host)))
    return 'Host not allowed. Reach the server by IP address or localhost, or start it with --allow-host <name>.';
  const origin = req.headers.origin;
  if (origin === undefined) return undefined;
  let originHost: string | undefined;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    originHost = undefined;
  }
  if (originHost !== req.headers.host?.toLowerCase()) return 'Origin not allowed.';
  return undefined;
}
