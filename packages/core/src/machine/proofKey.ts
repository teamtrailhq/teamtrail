import { createHash, createPrivateKey, generateKeyPairSync, randomBytes, type KeyObject } from 'node:crypto';
import { linkSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { configDir } from '../server/trackerConfig';
import { writePrivateFile } from './writePrivateFile';

/*
 * This machine's proof-signing key, Ed25519, created on first use:
 *   <config dir>/proof-key.json     { v, id, publicKey (SPKI DER, base64), privateKey (PKCS8 PEM) }, 0600
 * The private key never leaves it. The public key goes in the repo (`proof-keys/<id>.pub` in the tracker folder,
 * repoProofKey.ts), so anyone can check a report this machine signed.
 */
export const PROOF_KEY_FILE = 'proof-key.json';

interface Stored {
  v: 1;
  id: string;
  publicKey: string;
  privateKey: string;
}

/** A key's id: the first 16 hex characters of the SHA-256 of its public key's DER. */
export const proofKeyId = (publicKeyB64: string) =>
  createHash('sha256').update(Buffer.from(publicKeyB64, 'base64')).digest('hex').slice(0, 16);

function read(file: string): Stored | undefined {
  try {
    const s = JSON.parse(readFileSync(file, 'utf8')) as Stored;
    return s?.v === 1 && s.id === proofKeyId(s.publicKey) ? s : undefined;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT' || e instanceof SyntaxError) return undefined;
    throw e;
  }
}

function fresh(): Stored {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const pub = publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
  return {
    v: 1,
    id: proofKeyId(pub),
    publicKey: pub,
    privateKey: String(privateKey.export({ type: 'pkcs8', format: 'pem' })),
  };
}

/**
 * The key, created exclusively when missing: processes starting together share the first one's key. A file that
 * can't be read right now throws, and is never replaced.
 */
export function machineProofKey(dir: string = configDir()): { id: string; publicKey: string; privateKey: KeyObject } {
  const file = path.join(dir, PROOF_KEY_FILE);
  let s = read(file);
  if (!s) {
    const draft = `${file}.${process.pid}.${randomBytes(4).toString('hex')}`;
    writePrivateFile(draft, `${JSON.stringify(fresh())}\n`);
    try {
      linkSync(draft, file);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    } finally {
      rmSync(draft, { force: true });
    }
    s = read(file);
    if (!s) throw new Error(`${file} is not a proof key: move it away and Teamtrail makes a new one`);
  }
  return { id: s.id, publicKey: s.publicKey, privateKey: createPrivateKey(s.privateKey) };
}
