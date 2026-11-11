import { chmodSync, linkSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { machineAccess } from '../machine/machineAccess';
import { machineStore } from '../machine/machineStore';
import { SIGN_IN_REDIRECT } from './signInRedirectFile';
import { signInRedirectPage } from './signInRedirectPage';
import type { SignInPlace } from './signInStore';

/**
 * A one-time page that sends the browser on to `link` (`…#pair=<code>`), so the browser can be opened on the page's
 * random path and the code never goes on a command line, which every process of this user can read for a moment.
 * It lives where the code itself is minted, the machine store: 0600 in a 0700 folder, so whoever can read it could
 * already make a code of their own. Created exclusively, never overwritten; the Lookout removes it once the code is
 * used or expires, and on stop (sweepSignInRedirects.ts). Returns the file's path; throws, saying why, when the
 * store can't be written.
 */
export function writeSignInRedirect(at: SignInPlace & { link: string }): string {
  const store = machineStore(at.root, at.configDir);
  const file = store.file(SIGN_IN_REDIRECT.newName());
  const tmp = `${file}.${process.pid}.tmp`;
  try {
    mkdirSync(store.dir, { recursive: true, mode: 0o700 });
    chmodSync(store.dir, 0o700);
    writeFileSync(tmp, signInRedirectPage(at.link), { mode: 0o600, flag: 'wx' });
    chmodSync(tmp, 0o600);
    // a link, not a rename: it fails rather than replace a file of that name, and the page appears whole
    linkSync(tmp, file);
  } catch (e) {
    throw new Error(machineAccess(at.configDir) ?? (e as Error).message);
  } finally {
    rmSync(tmp, { force: true });
  }
  return file;
}
