import { BRAND } from '@teamtrail/core';
import { serverProven } from './serverProof';
import { readSession } from './session';

/** The session header the Lookout's API checks on every call (core signIn/signInHeader.ts). */
export const SESSION_HEADER = 'X-Teamtrail-Session';

function rawUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

function isApi(input: RequestInfo | URL) {
  const url = new URL(rawUrl(input), location.href);
  const prefix = BRAND.apiPrefix;
  return url.origin === location.origin && (url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
}

/**
 * Every API call of this page carries the session header, once the server proved it is this page's Lookout
 * (serverProof.ts): `fetch` is wrapped once, before anything renders, so no call site can forget it, and none can
 * send it to a server that hasn't proven itself. Only calls to this origin's API get it.
 */
export function installSessionHeader() {
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const session = serverProven() ? readSession() : undefined;
    if (!session || !isApi(input)) return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set(SESSION_HEADER, session.secret);
    return original(input, { ...init, headers });
  };
}
