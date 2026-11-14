import { BRAND } from '@teamtrail/core';
import { managedSignIn } from './managedSignIn';
import { proveServer } from './serverProof';

/**
 * Called when the event stream drops: a revoked or expired session ends it, and so does a Lookout that stopped.
 * The server proves itself again; a session it no longer knows was forgotten, so the page reloads into "Pair this
 * browser". A server that doesn't prove itself is handled by the sign-in gate ("isn't running here").
 */
export function reloadIfSignedOut() {
  // managed: the server in front sends a signed-out browser to its own sign-in when the page reloads
  if (managedSignIn())
    return void fetch(`${BRAND.apiPrefix}/session`, { cache: 'no-store' }).then(
      (r) => r.status === 401 && location.reload(),
    );
  void proveServer().then((s) => s === 'unknown' && location.reload());
}
