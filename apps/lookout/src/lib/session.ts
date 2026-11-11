import { BRAND } from '@teamtrail/core';

/*
 * This browser's Lookout session, kept in the storage of the Lookout's own origin (scheme, host and port). Pages of
 * any other origin, other ports of localhost included, can't read it; and unlike a cookie, the browser never sends
 * it anywhere by itself: the page adds it to its own API calls (sessionFetch.ts). Started on another port, the
 * Lookout is another origin and the browser pairs again.
 */
const KEY = `${BRAND.slug}.session`;

export function readSession(): string | undefined {
  try {
    return localStorage.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function keepSession(value: string) {
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // storage blocked: the session lasts as long as the page
  }
  memory = value;
}

export function forgetSession() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing kept
  }
  memory = undefined;
}

/** When storage is blocked, the session of this page load. */
let memory: string | undefined;

/** The session to send: from storage, else this page load's. */
export const currentSession = () => readSession() ?? memory;
