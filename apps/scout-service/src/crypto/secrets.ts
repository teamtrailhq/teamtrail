import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/;

/** Random secrets, their hashes, and the PKCE check. Secrets are 256 bits, base64url. */
export const secrets = {
  random: (prefix = '') => `${prefix}${randomBytes(32).toString('base64url')}`,
  hash: (value: string) => createHash('sha256').update(value).digest('hex'),
  /** A PKCE challenge or verifier as the Lookout makes them: 43 base64url characters. */
  wellFormed: (value: unknown): value is string => typeof value === 'string' && BASE64URL_43.test(value),
  challengeOf: (verifier: string) => createHash('sha256').update(verifier).digest('base64url'),
  /** Whether `verifier` is the one `challenge` was made from (S256), compared in constant time. */
  verifies(verifier: string, challenge: string) {
    const a = Buffer.from(secrets.challengeOf(verifier));
    const b = Buffer.from(challenge);
    return a.length === b.length && timingSafeEqual(a, b);
  },
  sameText(a: string, b: string) {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  },
};
