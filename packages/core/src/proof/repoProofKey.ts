import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { machineProofKey } from '../machine/proofKey';

/** The tracker folder's committed public keys: `<tracker dir>/proof-keys/<id>.pub`. */
export const PROOF_KEYS_DIR = 'proof-keys';

/** One public key file's text: `ed25519 <SPKI DER, base64> <label>`. */
export const proofKeyLine = (publicKey: string, label = 'teamtrail') => `ed25519 ${publicKey} ${label}\n`;

/**
 * Writes this machine's public key into the tracker folder when it isn't there yet, for the human to commit: a
 * report this machine signed verifies elsewhere only once its key is on the branch the check reads keys from.
 * Returns the file, relative to the tracker folder, or undefined when there is no key here.
 */
export function ensureRepoProofKey(root: string, dir?: string): string | undefined {
  let key: ReturnType<typeof machineProofKey>;
  try {
    key = machineProofKey(dir);
  } catch {
    return undefined;
  }
  const rel = path.join(PROOF_KEYS_DIR, `${key.id}.pub`);
  const file = path.join(root, rel);
  if (!existsSync(file)) {
    mkdirSync(path.dirname(file), { recursive: true });
    try {
      writeFileSync(file, proofKeyLine(key.publicKey), { flag: 'wx' });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
  return rel;
}
