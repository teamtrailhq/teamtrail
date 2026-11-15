import { proofKeyId } from '../machine/proofKey';

const LINE = /^ed25519\s+([A-Za-z0-9+/]+={0,2})(?:\s|$)/;

/** Public keys by id from the text of `.pub` files (`ed25519 <base64> <label>`); anything else is skipped. */
export function parseProofKeys(texts: string[]): Map<string, string> {
  const keys = new Map<string, string>();
  for (const text of texts) {
    for (const line of text.split('\n')) {
      const m = line.trim().match(LINE);
      if (m) keys.set(proofKeyId(m[1]), m[1]);
    }
  }
  return keys;
}
