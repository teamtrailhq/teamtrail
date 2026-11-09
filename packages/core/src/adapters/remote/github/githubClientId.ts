import { BRAND } from '../../../model/brand';

/**
 * The client id of Teamtrail's GitHub OAuth app, used for "Sign in with GitHub" (the device flow: no client secret,
 * no Teamtrail server). EMPTY UNTIL THE APP IS REGISTERED on GitHub with "Enable Device Flow" checked; while it is
 * empty the Sign in button doesn't show. A client id is public, so it can live in the code.
 * `$TEAMTRAIL_GITHUB_CLIENT_ID` overrides it (your own OAuth app, or the fake GitHub in the end-to-end check).
 */
const TEAMTRAIL_GITHUB_CLIENT_ID = '';

/** The OAuth app's client id, or undefined when Sign in with GitHub isn't available. */
export function githubClientId(env: Record<string, string | undefined>): string | undefined {
  const own = env[`${BRAND.slug.toUpperCase()}_GITHUB_CLIENT_ID`]?.trim();
  return own || TEAMTRAIL_GITHUB_CLIENT_ID || undefined;
}
