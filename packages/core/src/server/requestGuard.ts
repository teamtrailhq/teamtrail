import type { IncomingMessage } from 'node:http';
import { isIP } from 'node:net';
import type { TLSSocket } from 'node:tls';

/** A Host header's host name, lower-cased, without port or IPv6 brackets; undefined when it isn't one. */
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
 * Why a request is refused before anything else is looked at, or undefined when it may go on. Every server
 * Teamtrail runs on the user's machine (the bridge, the projects hub, the MCP endpoint) asks this first; it is
 * what stops a web page from reaching them through DNS rebinding or a cross-site request:
 * - `Host` must be an IP address, `localhost`, or a name in `allowedHosts`. A rebinding page always arrives with
 *   its own domain as the host, never an IP address.
 * - A request with an `Origin` (a browser) must come from the server's own origin: same scheme, host and port.
 *   `Origin: null` (a sandboxed page) is never that. For a name in `allowedHosts`, the https origin of that same
 *   host is accepted too (a TLS-terminating proxy in front).
 */
export function requestRefusal(req: IncomingMessage, allowedHosts: string[] = []): string | undefined {
  const host = hostName(req.headers.host);
  const allowed = new Set(['localhost', ...allowedHosts.map((h) => h.toLowerCase())]);
  if (!host || !(isIP(host) || allowed.has(host)))
    return 'Host not allowed. Reach the server by IP address or localhost.';
  const origin = req.headers.origin;
  if (origin === undefined) return undefined;
  const scheme = (req.socket as Partial<TLSSocket> | undefined)?.encrypted ? 'https' : 'http';
  const own = `${scheme}://${req.headers.host}`.toLowerCase();
  if (origin.toLowerCase() === own) return undefined;
  // A name the person allowed is usually a TLS-terminating proxy or tunnel in front: the browser there says
  // https while this socket is plain. Same host, exactly; only the scheme may differ.
  const proxied =
    allowed.has(host) && host !== 'localhost' && origin.toLowerCase() === `https://${req.headers.host}`.toLowerCase();
  return proxied ? undefined : 'Origin not allowed.';
}

const LOOPBACK = /^(127\.\d+\.\d+\.\d+|::1|::ffff:127\.\d+\.\d+\.\d+)$/;

/** How a server learns who is on the other end of the connection. Never a header: those are the caller's to write. */
export type PeerAddress = (req: IncomingMessage) => string | undefined;

/**
 * Whether the request comes from this machine, by the socket's remote address. A tunnel or reverse proxy on
 * this machine also connects from loopback, so whoever runs one in front of a port has opened that port.
 */
export function fromThisMachine(req: IncomingMessage, peer: PeerAddress = (r) => r.socket.remoteAddress) {
  return LOOPBACK.test(peer(req) ?? '');
}
