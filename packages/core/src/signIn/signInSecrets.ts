import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** A session value: 256 random bits, base64url (43 characters). */
export const newSessionSecret = () => randomBytes(32).toString('base64url');

/** What the store keeps of a session or a code: its SHA-256, hex. */
export const secretHash = (secret: string) => createHash('sha256').update(secret, 'utf8').digest('hex');

/** The value a session must have, before anything is looked up. */
export const SESSION_SHAPE = /^[A-Za-z0-9_-]{43}$/;

/**
 * The entry whose hash matches `secret`. Every entry is compared, in constant time, so neither a near miss nor an
 * entry's position shows in the timing.
 */
export function findByHash<T extends { hash: string }>(entries: T[], secret: string): T | undefined {
  const given = Buffer.from(secretHash(secret), 'hex');
  let match: T | undefined;
  for (const e of entries) {
    const stored = Buffer.from(e.hash, 'hex');
    if (stored.length === given.length && timingSafeEqual(stored, given)) match = e;
  }
  return match;
}
