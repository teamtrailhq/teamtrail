import { proveServer } from './serverProof';

/**
 * Called when the event stream drops: a revoked or expired session ends it, and so does a Lookout that stopped.
 * The server proves itself again; a session it no longer knows was forgotten, so the page reloads into "Pair this
 * browser". A server that doesn't prove itself is handled by the sign-in gate ("isn't running here").
 */
export function reloadIfSignedOut() {
  void proveServer().then((s) => s === 'unknown' && location.reload());
}
