import { BRAND } from '@teamtrail/core';
import { currentSession } from './session';

/** The session header the Lookout's API checks on every call (core signIn/signInHeader.ts). */
export const SESSION_HEADER = 'X-Teamtrail-Session';

function rawUrl(input: RequestInfo | URL) {
  if (typeof input === 'string') return input;
  return input instanceof URL ? input.href : input.url;
}

function isApi(input: RequestInfo | URL) {
  const raw = rawUrl(input);
  const url = new URL(raw, location.href);
  const prefix = BRAND.apiPrefix;
  return url.origin === location.origin && (url.pathname === prefix || url.pathname.startsWith(`${prefix}/`));
}

/**
 * Every API call of this page carries the session header: `fetch` is wrapped once, before anything renders, so
 * no call site can forget it. Only calls to this origin's API get it; nothing else ever sees the session.
 */
export function installSessionHeader() {
  const original = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const session = currentSession();
    if (!session || !isApi(input)) return original(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    headers.set(SESSION_HEADER, session);
    return original(input, { ...init, headers });
  };
}
