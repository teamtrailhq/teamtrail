import { randomBytes, randomInt } from 'node:crypto';
import type { SignInKind, StoredPairCode } from '../model/signIn';
import { secretHash } from './signInSecrets';
import { type SignInPlace, updateSignIns } from './signInStore';

/** A link the CLI prints or opens works for ten minutes. */
export const LINK_CODE_MS = 10 * 60_000;
/** A code typed on another device works for five. */
export const TYPED_CODE_MS = 5 * 60_000;
/** Codes waiting at once; past that the oldest goes. */
const MAX_CODES = 20;

/** No 0/O, 1/I/L or U: easy to read off one screen and type on another. 30 letters, 8 of them: about 39 bits. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
const TYPED = new RegExp(`^[${ALPHABET}]{8}$`);
const LINK = /^[A-Za-z0-9_-]{43}$/;

/**
 * A code as it is compared: a link's 256-bit code exactly (`link`), a typed one in upper case without spaces or
 * dashes (`typed`). Anything else is no code at all, and undefined.
 */
export function normalizePairCode(input: unknown): { kind: 'link' | 'typed'; code: string } | undefined {
  if (typeof input !== 'string' || input.length > 64) return undefined;
  const trimmed = input.trim();
  if (LINK.test(trimmed)) return { kind: 'link', code: trimmed };
  const typed = trimmed.toUpperCase().replace(/[\s-]/g, '');
  return TYPED.test(typed) ? { kind: 'typed', code: typed } : undefined;
}

function typedCode() {
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return s;
}

/** `ABCDEFGH` as it is shown: `ABCD-EFGH`. */
export const showTypedCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

/**
 * A new single-use pairing code, kept hashed, for one Lookout process (`instance`, its pid). `machine`: a long
 * code for a link the CLI prints (`teamtrail`, `teamtrail pair`). `device`: a short code to type or scan on another
 * device (Settings → Pair a device).
 */
export function mintPairCode(at: SignInPlace & { kind: SignInKind; instance: number; now?: number }) {
  const now = at.now ?? Date.now();
  const code = at.kind === 'machine' ? randomBytes(32).toString('base64url') : typedCode();
  const expiresAt = now + (at.kind === 'machine' ? LINK_CODE_MS : TYPED_CODE_MS);
  const entry: StoredPairCode = {
    hash: secretHash(code),
    kind: at.kind,
    instance: at.instance,
    createdAt: now,
    expiresAt,
  };
  updateSignIns(at, (file) => {
    const live = file.codes.filter((c) => c.expiresAt > now);
    return { file: { ...file, codes: [...live, entry].slice(-MAX_CODES) }, result: undefined };
  });
  return { code: at.kind === 'machine' ? code : showTypedCode(code), expiresAt };
}
