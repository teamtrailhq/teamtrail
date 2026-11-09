import { BRAND } from '../../../model/brand';

/**
 * The client id of Teamtrail's GitHub OAuth app, used for "Sign in with GitHub" (the device flow: no client secret,
 * no Teamtrail server). The app is registered under teamtrailhq with "Enable Device Flow" checked. A client id is
 * public, so it can live in the code.
 * `$TEAMTRAIL_GITHUB_CLIENT_ID` overrides it (your own OAuth app, or the fake GitHub in the end-to-end check).
 */
const TEAMTRAIL_GITHUB_CLIENT_ID = 'Ov23lilBuZFa2VJLNrlN';

/** The OAuth app's client id, or undefined when Sign in with GitHub isn't available. */
export function githubClientId(env: Record<string, string | undefined>): string | undefined {
  const own = env[`${BRAND.slug.toUpperCase()}_GITHUB_CLIENT_ID`]?.trim();
  return own || TEAMTRAIL_GITHUB_CLIENT_ID || undefined;
}
