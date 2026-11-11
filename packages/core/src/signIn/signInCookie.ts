import type { IncomingMessage } from 'node:http';
import type { TLSSocket } from 'node:tls';
import { projectId } from '../projects/projectId';
import { SESSION_MS } from './signInSessions';

/*
 * The session cookie. Cookies don't keep ports apart: every app on `localhost` gets the cookies of every other
 * port, and can set one. So the name carries the project the Lookout serves (`teamtrail_<project id>`): two
 * Lookouts of two repos never read each other's, and a restart on another port keeps the browser signed in.
 * HttpOnly, so no page script reads it (not even another localhost app's); SameSite=Strict, so no other site's
 * page sends it; Path=/; Secure when the connection is TLS. A request that carries the name twice (another app
 * set one with another path or domain to shadow it) is refused rather than guessed.
 */
export const cookieName = (root: string) => `teamtrail_${projectId(root)}`;

export type CookieRead = { kind: 'none' } | { kind: 'one'; value: string } | { kind: 'ambiguous' };

/** The values of `name` in the request's Cookie header. */
export function readCookie(req: IncomingMessage, name: string): CookieRead {
  const header = req.headers.cookie ?? '';
  const values: string[] = [];
  for (const part of header.split(';')) {
    const at = part.indexOf('=');
    if (at < 0 || part.slice(0, at).trim() !== name) continue;
    values.push(part.slice(at + 1).trim());
  }
  if (values.length > 1) return { kind: 'ambiguous' };
  return values.length ? { kind: 'one', value: values[0] } : { kind: 'none' };
}

const secure = (req: IncomingMessage) => !!(req.socket as Partial<TLSSocket> | undefined)?.encrypted;

/** The Set-Cookie value that signs this browser in. */
export function sessionCookie(req: IncomingMessage, at: { name: string; value: string }) {
  const parts = [`${at.name}=${at.value}`, 'Path=/', `Max-Age=${SESSION_MS / 1000}`, 'HttpOnly', 'SameSite=Strict'];
  return (secure(req) ? [...parts, 'Secure'] : parts).join('; ');
}

/** The Set-Cookie value that signs it out. */
export function clearedCookie(req: IncomingMessage, name: string) {
  const parts = [`${name}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Strict'];
  return (secure(req) ? [...parts, 'Secure'] : parts).join('; ');
}
