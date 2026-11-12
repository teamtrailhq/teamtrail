import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';
const IV = 12;
const TAG = 16;

/**
 * Seals bot tokens at rest with AES-256-GCM. Each sealed token is bound to its workspace (the team id is the
 * additional data), so a row copied to another workspace doesn't open.
 */
export class TokenCipher {
  constructor(private key: Buffer) {
    if (key.length !== 32) throw new Error('The token key must be 32 bytes');
  }

  seal(plain: string, teamId: string) {
    const iv = randomBytes(IV);
    const c = createCipheriv('aes-256-gcm', this.key, iv, { authTagLength: TAG });
    c.setAAD(Buffer.from(teamId));
    const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
    return `${VERSION}:${Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url')}`;
  }

  /** The token, or an error when it was sealed with another key or for another workspace. */
  open(sealed: string, teamId: string) {
    const [version, data] = sealed.split(':');
    if (version !== VERSION || !data) throw new Error('Unknown sealed token format');
    const raw = Buffer.from(data, 'base64url');
    // A short input would let a truncated tag through; a token is never empty.
    if (raw.length <= IV + TAG) throw new Error('Sealed token too short');
    const d = createDecipheriv('aes-256-gcm', this.key, raw.subarray(0, IV), { authTagLength: TAG });
    d.setAAD(Buffer.from(teamId));
    d.setAuthTag(raw.subarray(IV, IV + TAG));
    return Buffer.concat([d.update(raw.subarray(IV + TAG)), d.final()]).toString('utf8');
  }
}
