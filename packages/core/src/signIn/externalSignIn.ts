import type { IncomingMessage, ServerResponse } from 'node:http';
import type { SignInKind } from '../model/signIn';

/** Who a request is from, as a server's own sign-in says: `machine` may do what only this machine may do. */
export interface ExternalCaller {
  /** Stable, safe to show and to journal. */
  id: string;
  kind: SignInKind;
  /**
   * `false`: this caller may not make high-risk calls (by the risk policy, policy/needsLookout.ts). What they do in
   * the Lookout counts at every gate but those, as a Slack answer does (model/answerVia.ts `lookout-limited`), and
   * they can't close a high-risk ticket or approve a reroute. Unset or `true`: allowed.
   */
  highRisk?: boolean;
}

/**
 * Sign-in for a server that embeds the Lookout and brings its own, in place of pairing browsers
 * (signIn/lookoutSignIn.ts). The projects hub asks it about every request before any route: it answers what it
 * must itself (`GET /session` with `signedIn`, its refusals) and returns the caller of everything else.
 * A `device` caller is a device's everywhere behind the hub, whatever the socket says; whether a `machine` caller
 * counts as this machine is still the hub's `peer`'s to say.
 */
export interface ExternalSignIn {
  admit(
    req: IncomingMessage,
    res: ServerResponse,
    at: { route: string; homeId: string },
  ): ExternalCaller | undefined | Promise<ExternalCaller | undefined>;
}
