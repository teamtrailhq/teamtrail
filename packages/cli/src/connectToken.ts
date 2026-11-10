import { BRAND } from '@teamtrail/core';
import { fail } from './args/help';
import { readStdin } from './usage/hook';

/**
 * The token for `connect --url`, from the place that keeps it out of shell history first: stdin
 * (`--token-stdin`), then `--token`, then `$TEAMTRAIL_TOKEN`. Undefined when none was given.
 */
export async function connectToken(o: { token?: string; tokenStdin?: boolean }): Promise<string | undefined> {
  if (o.tokenStdin && o.token) fail('pass the token with --token or --token-stdin, not both');
  const given = o.tokenStdin ? (await readStdin()).trim() : (o.token ?? process.env[BRAND.tokenEnv])?.trim();
  if (o.tokenStdin && !given) fail('--token-stdin got nothing on stdin');
  return given || undefined;
}
