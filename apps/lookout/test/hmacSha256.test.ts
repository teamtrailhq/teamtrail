import { createHash, createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { fromHex, hex, hmacSha256, sha256 } from '../src/lib/hmacSha256';

describe('the page’s own SHA-256 and HMAC (no WebCrypto over plain http on a phone)', () => {
  it('matches Node’s for every length around the block edges', () => {
    for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 200, 1000]) {
      const data = randomBytes(n);
      expect(hex(sha256(data))).toBe(createHash('sha256').update(data).digest('hex'));
      const key = randomBytes(n % 3 === 0 ? 32 : 100);
      expect(hex(hmacSha256(key, data))).toBe(createHmac('sha256', key).update(data).digest('hex'));
    }
    expect(hex(fromHex('00ff10'))).toBe('00ff10');
  });
});
