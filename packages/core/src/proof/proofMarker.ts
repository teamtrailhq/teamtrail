import type { ProofSignature } from '../model/proof';

/** A proof's first line: the digest, and the machine's signature over it when there is one. */
export const proofMarker = (digest: string, s?: ProofSignature) =>
  `<!-- teamtrail:proof v1 ${digest}${s ? ` key:${s.keyId} sig:${s.sig}` : ''} -->`;
