import { BRAND } from '@teamtrail/core';

let asking = false;

/**
 * Called when the event stream drops: a revoked or expired session ends it. If the server now says this browser
 * isn't signed in, the page reloads into "Pair this browser". A server that is down or restarting answers nothing,
 * and the stream reconnects as before.
 */
export function reloadIfSignedOut() {
  if (asking) return;
  asking = true;
  fetch(`${BRAND.apiPrefix}/session`, { cache: 'no-store' })
    .then((r) => (r.ok ? (r.json() as Promise<{ signedIn?: boolean }>) : undefined))
    .then((s) => {
      if (s?.signedIn === false) location.reload();
    })
    .catch(() => {})
    .finally(() => (asking = false));
}
