import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { configDir } from '../server/trackerConfig';
import { ensurePrivateDir, isPrivateDir } from './privateDir';

/** The user config dir, or a folder already private to this user: what is written there is private too. */
function privateTarget(dir: string) {
  return path.resolve(dir) === path.resolve(configDir()) || isPrivateDir(dir);
}

/**
 * Write via a temp file + rename so readers never see half a document. In the user config dir (or any folder
 * private to this user) the folder is kept 0700 and the file is 0600 before it is visible, whoever writes it:
 * Teamtrail, the Slack connector, or a test passing its own config dir.
 */
export function writeJsonAtomic(file: string, value: unknown, opts: { private?: boolean } = {}) {
  const dir = path.dirname(file);
  const secret = opts.private || privateTarget(dir);
  if (secret) ensurePrivateDir(dir);
  else mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), secret ? { mode: 0o600 } : {});
  renameSync(tmp, file);
  if (secret && process.platform !== 'win32') chmodSync(file, 0o600);
}

/** The parsed file, or undefined when it is missing or not JSON. */
export function readJsonFile<T>(file: string): T | undefined {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  } catch {
    return undefined;
  }
}
