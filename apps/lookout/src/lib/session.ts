import { BRAND } from '@teamtrail/core';

/** What a paired browser keeps: the session's id (for the server's proof), the session, and its verifier. */
export interface StoredSession {
  id: string;
  secret: string;
  verifier: string;
}

/*
 * This browser's Lookout session, in the storage of the Lookout's own origin (scheme, host and port). Pages of any
 * other origin, other ports of localhost included, can't read it; and unlike a cookie, the browser never sends it
 * anywhere by itself: the page adds it to its own API calls once the server proved it is its Lookout
 * (serverProof.ts, sessionFetch.ts).
 */
const KEY = `${BRAND.slug}.session`;

/** When storage is blocked, the session of this page load. */
let memory: StoredSession | undefined;

const isStored = (v: unknown): v is StoredSession => {
  const s = v as StoredSession;
  return !!s && typeof s.id === 'string' && typeof s.secret === 'string' && typeof s.verifier === 'string';
};

export function readSession(): StoredSession | undefined {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) ?? 'null') as unknown;
    return isStored(parsed) ? parsed : memory;
  } catch {
    return memory;
  }
}

export function keepSession(value: StoredSession) {
  memory = value;
  try {
    localStorage.setItem(KEY, JSON.stringify(value));
  } catch {
    // storage blocked: the session lasts as long as the page
  }
}

export function forgetSession() {
  memory = undefined;
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing kept
  }
}
