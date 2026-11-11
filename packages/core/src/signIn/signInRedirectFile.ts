import { randomBytes } from 'node:crypto';

/**
 * The names of the one-time pages that open a browser on a sign-in link (writeSignInRedirect.ts), in the machine
 * store: `sign-in-<192 random bits, hex>.html`, and the temp file each is written as before it appears.
 */
export const SIGN_IN_REDIRECT = {
  page: /^sign-in-[0-9a-f]{48}\.html$/,
  any: /^sign-in-[0-9a-f]{48}\.html(?:\.\d+\.tmp)?$/,
  newName: () => `sign-in-${randomBytes(24).toString('hex')}.html`,
};
