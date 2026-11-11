import type { IncomingMessage } from 'node:http';

/*
 * How a browser shows its session: the `X-Teamtrail-Session` header, set by the Lookout page from storage of its own
 * origin. Never a cookie: cookies don't keep ports apart (RFC 6265 §8.5), so any other server on the same host
 * (an agent's dev server on localhost:3000, another service on the Lookout's IP) would get it on every visit.
 * A page of another origin can't read the Lookout's storage, and can't send this header to it either: a custom
 * header needs a CORS preflight the Lookout never allows, and the Origin check refuses the request first.
 */
export const SESSION_HEADER = 'x-teamtrail-session';

/** The session value a request carries; a header sent twice arrives joined and matches no session. */
export function sessionOf(req: IncomingMessage): string | undefined {
  const v = req.headers[SESSION_HEADER];
  return typeof v === 'string' ? v : undefined;
}
