import { chmodSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';

const POSIX = process.platform !== 'win32';

/**
 * A folder only this user may read: created 0700, and tightened to 0700 when an older version (or another
 * writer) left it looser, along with any file in it readable by others (to 0600). For the user config dir,
 * where tokens and this person's settings live.
 *
 * Windows has no POSIX mode bits: Node maps them to the read-only flag and ignores the rest, so this does
 * nothing there. The config dir lives under %APPDATA% (the user's profile), whose ACL already keeps other
 * users out.
 */
export function ensurePrivateDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (!POSIX) return;
  if ((statSync(dir).mode & 0o077) !== 0) chmodSync(dir, 0o700);
  for (const name of readdirSync(dir)) tighten(`${dir}/${name}`);
}

function tighten(file: string) {
  try {
    const st = statSync(file);
    if (st.isFile() && (st.mode & 0o077) !== 0) chmodSync(file, 0o600);
  } catch {
    // gone in the meantime
  }
}

/** Whether `dir` is a folder of this user's only (0700 on POSIX): files written into it are kept private too. */
export function isPrivateDir(dir: string) {
  if (!POSIX) return false;
  try {
    return (statSync(dir).mode & 0o077) === 0;
  } catch {
    return false;
  }
}
