import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { linkSync, readFileSync, rmSync } from 'node:fs';
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

/**
 * The key in `file`; undefined when the file is missing or isn't a key (damaged), which may be replaced. Any other
 * read error (EACCES, EMFILE, EIO…) throws: a key that can't be read right now is never replaced, or everything it
 * signed would read as forged.
 */
function readKey(file: string): string | undefined {
  let text: string;
  try {
    text = readFileSync(file, 'utf8').trim();
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw e;
  }
  return KEY.test(text) ? text : undefined;
}

/**
 * The key, created when missing. Created exclusively: two processes starting together both end up with the first
 * one's key, never one each (a second key would make everything the first signed read as forged, signedState/).
 */
export function machineKey(dir: string = configDir()): string {
  const file = path.join(dir, MACHINE_KEY_FILE);
  const known = readKey(file);
  if (known) return known;
  const draft = `${file}.${process.pid}.${randomBytes(4).toString('hex')}`;
  writePrivateFile(draft, `${randomBytes(32).toString('hex')}\n`);
  try {
    linkSync(draft, file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
  } finally {
    rmSync(draft, { force: true });
  }
  const made = readKey(file);
  if (made) return made;
  // missing after the link (a dangling link) or a file that isn't a key (damaged): replaced, as before
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
