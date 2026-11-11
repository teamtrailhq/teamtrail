import { chmodSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Writes a file only this user can read (0600) in a folder only they can open (0700), via a temp file and a
 * rename, so a reader never sees half of it and the mode applies before the file is visible.
 */
export function writePrivateFile(file: string, text: string) {
  const dir = path.dirname(file);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    chmodSync(dir, 0o700);
  } catch {
    // a folder we don't own (or Windows): the file mode below still applies
  }
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text, { mode: 0o600 });
  renameSync(tmp, file);
  chmodSync(file, 0o600);
}
