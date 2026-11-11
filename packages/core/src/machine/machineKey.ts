import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { configDir } from '../server/trackerConfig';
import { writePrivateFile } from './writePrivateFile';

/*
 * This machine's secret, for what has to stay in the repo's folder but must be known to come from Teamtrail here:
 *   <config dir>/machine.key     32 random bytes as hex, 0600, created on first use
 * Files signed with it (answers to agents' questions) can be read by anyone who can read the repo, and forged by
 * no one who can only write there.
 */
export const MACHINE_KEY_FILE = 'machine.key';

const KEY = /^[0-9a-f]{64}$/;

function readKey(file: string): string | undefined {
  try {
    const text = readFileSync(file, 'utf8').trim();
    return KEY.test(text) ? text : undefined;
  } catch {
    return undefined;
  }
}

/** The key, created when missing. Two processes starting together may both write; the second read settles on one. */
export function machineKey(dir: string = configDir()): string {
  const file = path.join(dir, MACHINE_KEY_FILE);
  const known = readKey(file);
  if (known) return known;
  writePrivateFile(file, `${randomBytes(32).toString('hex')}\n`);
  return readKey(file)!;
}

/** HMAC-SHA256 of `parts` (length-prefixed, so no two lists of parts share a signature) under the machine key. */
export function machineSign(parts: (string | number)[], dir?: string): string {
  const mac = createHmac('sha256', machineKey(dir));
  for (const p of parts) {
    const s = String(p);
    mac.update(`${Buffer.byteLength(s)}:${s}`);
  }
  return mac.digest('hex');
}

/**
 * Whether `signature` is this machine's signature of `parts`. Throws when the key can't be read or created (a config
 * folder the process may not use): callers fail closed and say why (machineAccess.ts), they never treat it as forged.
 */
export function machineSigned(parts: (string | number)[], signature: unknown, dir?: string): boolean {
  if (typeof signature !== 'string' || !KEY.test(signature)) return false;
  return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(machineSign(parts, dir), 'hex'));
}
