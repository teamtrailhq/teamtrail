import { BRAND, overrideUrl } from '@teamtrail/core';

/** Teamtrail's Scout service, the backend of the official Slack app. */
export const SCOUT_SERVICE = 'https://scout.teamtrail.app';

/**
 * Where the Scout service is: the built-in address, or `$TEAMTRAIL_SCOUT_SERVICE` (https, or http to this
 * machine, for the fakes in tests and the end-to-end check). Read from the environment only, never from the repo.
 */
export function scoutService(env: Record<string, string | undefined>) {
  const base = overrideUrl(env, `${BRAND.slug.toUpperCase()}_SCOUT_SERVICE`) ?? SCOUT_SERVICE;
  const http = base.replace(/\/+$/, '');
  return {
    http,
    /** The WebSocket address a linked Teamtrail connects to. */
    connect: `${http.replace(/^http/, 'ws')}/connect`,
    install: (o: { challenge: string; returnUrl: string }) => {
      const u = new URL(`${http}/install`);
      u.searchParams.set('challenge', o.challenge);
      u.searchParams.set('return', o.returnUrl);
      return u.toString();
    },
  };
}
export type ScoutServiceAddress = ReturnType<typeof scoutService>;
