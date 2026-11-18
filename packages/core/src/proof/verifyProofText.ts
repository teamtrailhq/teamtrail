import { createHash, createPublicKey, verify } from 'node:crypto';
import { canonicalJson } from '../lib/canonicalJson';
import type { Proof } from '../model/proof';
import { coversHead } from './coversHead';
import { proofMarkdown } from './proofMarkdown';

const MARKER = /<!-- teamtrail:proof v1 (sha256:[0-9a-f]{64})(?: key:([0-9a-f]{16}) sig:([A-Za-z0-9+/]+={0,2}))? -->/;
const DATA = /<!-- teamtrail:proof-data ([A-Za-z0-9+/]+={0,2}) -->/;

export interface ProofCheck {
  /** The text is a report this machine-key set signed, unchanged. */
  valid: boolean;
  /** Valid and the proof says verified (and, with `head`, at that commit). */
  verified: boolean;
  problems: string[];
  proof?: Proof;
  keyId?: string;
}

const norm = (t: string) => t.replace(/\r\n/g, '\n').trim();

function decode(b64: string): Proof | undefined {
  try {
    const p = JSON.parse(Buffer.from(b64, 'base64').toString('utf8')) as Proof;
    return p?.v === 1 && typeof p.digest === 'string' ? p : undefined;
  } catch {
    return undefined;
  }
}

function signedBy(keys: Map<string, string>, digest: string, keyId?: string, sig?: string): string | undefined {
  if (!keyId || !sig) return 'The report is not signed.';
  const pub = keys.get(keyId);
  if (!pub) return `Signed by key ${keyId}, which is not one of the repo's proof keys.`;
  const key = createPublicKey({ key: Buffer.from(pub, 'base64'), format: 'der', type: 'spki' });
  return verify(null, Buffer.from(digest), key, Buffer.from(sig, 'base64'))
    ? undefined
    : 'The signature does not match.';
}

/**
 * Checks one report's text (a PR comment or description that holds it): the proof inside it hashes to its digest,
 * the digest is signed by one of `keys` (the repo's committed proof keys), the visible text is exactly what that
 * proof renders to, and, with `head`, the proof covers that commit. Deterministic; every problem is one line.
 */
export function verifyProofText(o: { text: string; keys: Map<string, string>; head?: string }): ProofCheck {
  const m = o.text.match(MARKER);
  const d = o.text.match(DATA);
  if (!m || !d) return { valid: false, verified: false, problems: ['No Teamtrail proof in this text.'] };
  const [, digest, keyId, sig] = m;
  const proof = decode(d[1]);
  if (!proof) return { valid: false, verified: false, problems: ["The proof data can't be read."] };
  const { digest: claimed, ...body } = proof;
  const actual = `sha256:${createHash('sha256').update(canonicalJson(body)).digest('hex')}`;
  const problems: string[] = [];
  if (actual !== claimed || actual !== digest) problems.push("The proof doesn't match its digest: it was changed.");
  const notSigned = signedBy(o.keys, digest, keyId, sig);
  if (notSigned) problems.push(notSigned);
  const start = o.text.indexOf(m[0]);
  const end = o.text.indexOf(d[0]) + d[0].length;
  if (!problems.length && norm(o.text.slice(start, end)) !== norm(proofMarkdown(proof, { keyId, sig })))
    problems.push("The report's text was edited after Teamtrail wrote it.");
  const valid = problems.length === 0;
  if (valid && proof.status !== 'verified') problems.push(`Not verified: ${proof.gaps[0] ?? 'see the report'}`);
  const head = proof.git?.head;
  if (valid && o.head && !coversHead(head, o.head))
    problems.push(`Verified at ${head?.slice(0, 7) ?? 'no commit'}, not at ${o.head.slice(0, 7)}.`);
  return { valid, verified: problems.length === 0, problems, proof, keyId };
}
