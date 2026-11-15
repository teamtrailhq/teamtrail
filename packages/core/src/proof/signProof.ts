import { sign } from 'node:crypto';
import { machineProofKey } from '../machine/proofKey';
import type { Proof, ProofSignature } from '../model/proof';

/** This machine's Ed25519 signature over the proof's digest; undefined when the key can't be read or made here. */
export function signProof(proof: Proof, dir?: string): ProofSignature | undefined {
  try {
    const key = machineProofKey(dir);
    return { keyId: key.id, sig: sign(null, Buffer.from(proof.digest), key.privateKey).toString('base64') };
  } catch {
    return undefined;
  }
}
