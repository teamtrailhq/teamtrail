import type { Proof } from '../model/proof';
import { proofMarkdown } from './proofMarkdown';
import { ensureRepoProofKey } from './repoProofKey';
import { signProof } from './signProof';

/**
 * The proof's Markdown signed with this machine's key, and the key's public file put in the tracker folder for the
 * human to commit. Unsigned when the key can't be read here (an agent's sandbox that blocks the config dir).
 */
export function signedProofMarkdown(root: string, proof: Proof, dir?: string) {
  const signature = signProof(proof, dir);
  const keyFile = signature ? ensureRepoProofKey(root, dir) : undefined;
  return { markdown: proofMarkdown(proof, signature), signature, keyFile };
}
