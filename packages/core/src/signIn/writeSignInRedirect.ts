import { chmodSync, linkSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { machineAccess } from '../machine/machineAccess';
import { machineStore } from '../machine/machineStore';
import { SIGN_IN_REDIRECT } from './signInRedirectFile';
import { signInRedirectPage } from './signInRedirectPage';
import type { SignInPlace } from './signInStore';

/**
 * A one-time page that sends the browser on to `link` (`…#pair=<code>`), so the browser can be opened on the page's
 * random path and the code never goes on a command line, which every process of this user can read for a moment.
 * The page is a bearer secret: anything that can read the config dir (an agent sandbox that may read but not
 * write it, say) can read the code in it and sign in as this machine, which minting a code of its own would need
 * write access for. So the code is an `opened-page` one that lives one minute (pairCodes.ts), works once, and its
 * use is announced in the terminal and in Settings. 0600 in a 0700 folder; created exclusively, never overwritten.
 * The Lookout removes it once the code is used or expires, and on stop (sweepSignInRedirects.ts). Returns the
 * file's path; throws, saying why, when the store can't be written.
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
