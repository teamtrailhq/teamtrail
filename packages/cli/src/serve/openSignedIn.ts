import { pathToFileURL } from 'node:url';
import { BRAND } from '@teamtrail/core';
import { writeSignInRedirect } from '@teamtrail/core/bridge';
import { openBrowser } from './openBrowser';

export type OpenedSignIn = { kind: 'sign-in-page'; file: string } | { kind: 'bare'; why: string };

/**
 * Opens the browser on a sign-in link without putting the link on a command line: a command line is readable by
 * every process of this user for a moment, and the code would be on it. The browser opens a one-time page in the
 * machine store instead (writeSignInRedirect.ts), 0600 with a random name, which sends it on to the link; only that
 * path is in the opener's argv, and whoever can read the file could already mint a code of their own. When the store
 * can't be written, the browser opens `fallback` (the bare Lookout) if there is one, and the terminal says why.
 */
export function openSignedIn(o: { root: string; link: string; fallback?: string; configDir?: string }): OpenedSignIn {
  let file: string;
  try {
    file = writeSignInRedirect({ root: o.root, configDir: o.configDir, link: o.link });
  } catch (e) {
    const why = (e as Error).message;
    const opening = o.fallback ? 'the browser opens signed out' : 'no browser was opened';
    process.stdout.write(`  ${BRAND.name} couldn't write its sign-in page (${why}), so ${opening}: use the link.\n\n`);
    if (o.fallback) openBrowser(o.fallback);
    return { kind: 'bare', why };
  }
  openBrowser(pathToFileURL(file).href);
  return { kind: 'sign-in-page', file };
}
