import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { BRAND } from '@teamtrail/core';
import { writeSignInRedirect } from '@teamtrail/core/bridge';
import { httpHandler } from './browser/httpHandler';
import type { HttpHandler } from './browser/types';
import { openBrowser } from './openBrowser';

export type OpenedSignIn = { kind: 'sign-in-page'; file: string; browser: string } | { kind: 'bare'; why: string };

interface OpenSignedInOptions {
  root: string;
  /** Makes the page's code (one minute, `opened-page`) and returns its link: only once a browser was found. */
  mint: () => string;
  /** The bare Lookout, opened when no page can be: none for `teamtrail pair`, which only prints then. */
  fallback?: string;
  configDir?: string;
  /** Finds the browser; default this machine's http handler (browser/httpHandler.ts). */
  handler?: () => HttpHandler;
}

function bare(o: OpenSignedInOptions, why: string): OpenedSignIn {
  const opening = o.fallback ? 'the browser opens signed out' : 'no browser was opened';
  process.stdout.write(`  ${BRAND.name} couldn't open a sign-in page (${why}), so ${opening}: use the link.\n\n`);
  if (o.fallback) openBrowser(o.fallback);
  return { kind: 'bare', why };
}

/**
 * Opens the browser ready to sign in without putting the code on a command line, which every process of this user
 * can read for a moment. The browser opens a one-time page in the machine store (writeSignInRedirect.ts), 0600 with
 * a random name, that sends it on to the link; only that path is in the argv. The page is a bearer secret: anything
 * that can read the config dir can read it and sign in, so its code lives one minute, and the Lookout announces
 * every pairing through it. It goes to the default http browser by name, never to whatever opens `.html` files (an
 * editor). With no such browser, or when the store can't be written, the browser opens `fallback` (the bare
 * Lookout) if there is one, and the terminal says why.
 */
export function openSignedIn(o: OpenSignedInOptions): OpenedSignIn {
  const browser = (o.handler ?? httpHandler)();
  if (browser.kind === 'none') return bare(o, browser.why);
  let file: string;
  try {
    file = writeSignInRedirect({ root: o.root, configDir: o.configDir, link: o.mint() });
  } catch (e) {
    return bare(o, (e as Error).message);
  }
  const [cmd, args] = browser.command(file);
  const failed = (e: Error) => {
    rmSync(file, { force: true });
    bare(o, `${browser.name} didn't start: ${e.message}`);
  };
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', failed);
    child.unref();
  } catch (e) {
    failed(e as Error);
  }
  return { kind: 'sign-in-page', file, browser: browser.name };
}
