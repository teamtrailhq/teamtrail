import type { TrailProof } from '../model/trailProof';
import { ensureRepoProofKey } from './repoProofKey';
import { signProof } from './signProof';
import { trailProofMarkdown } from './trailProofMarkdown';

/**
 * A trail's proof as Markdown, signed with this machine's key like a ticket's (signedProofMarkdown.ts), and the key's
 * public file put in the tracker folder for the human to commit. Unsigned when the key can't be read here.
 */
export function signedTrailProofMarkdown(root: string, proof: TrailProof, dir?: string) {
  const signature = signProof(proof, dir);
  const keyFile = signature ? ensureRepoProofKey(root, dir) : undefined;
  return { markdown: trailProofMarkdown(proof, signature), signature, keyFile };
}
