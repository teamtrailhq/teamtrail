/**
 * Sign-in to the Lookout. A browser is paired once, with a one-time code, and then sends its session in the
 * `X-Teamtrail-Session` header of every API call, from storage of the Lookout's own origin (never a cookie, which
 * every other port on the same host would get too). The server keeps only the SHA-256 of each session and code
 * (signIn/signInStore.ts), in the machine store.
 *
 * `machine`: paired on the machine Teamtrail runs on, with a link the CLI printed or opened. Only such a session,
 * from this machine, may use the routes that change what runs here or whom it trusts (server/thisMachineRoutes.ts).
 * `device`: paired with a code from Settings → You → Browsers & devices, or from another address. It reads,
 * answers and approves like any device on the network, and never more.
 */
export type SignInKind = 'machine' | 'device';

/** A paired browser, as stored: never the session itself. */
export interface StoredSignIn {
  /** Stable id (`si_…`), safe to show and to journal. */
  id: string;
  /** Read from the browser's user agent when it paired: "Chrome on macOS". */
  name: string;
  /** SHA-256 of the session value, hex. */
  hash: string;
  kind: SignInKind;
  /**
   * The Lookout start it was paired with (a random id per start). A session works for that running Lookout only:
   * when it stops, every session it had ends, so one a server squatting its port later captured opens nothing.
   */
  start: string;
  /** The process of that Lookout; once it is gone, the session is dropped from the file. */
  instance: number;
  pairedAt: number;
  /** To the minute. */
  lastUsedAt: number;
  /** Moves forward while the browser is used: 30 days after it was last used. */
  expiresAt: number;
}

/** A pairing code waiting to be used once: never the code itself. */
export interface StoredPairCode {
  /** SHA-256 of the code as it is typed back (upper case, no dashes), hex. */
  hash: string;
  /** What the session it opens may become; `machine` also needs the pairing to come from this machine. */
  kind: SignInKind;
  /** The Lookout process the code is for (its pid): no other Lookout, now or later, takes it. */
  instance: number;
  createdAt: number;
  expiresAt: number;
}

export interface SignInFile {
  v: 1;
  sessions: StoredSignIn[];
  codes: StoredPairCode[];
}

/** A paired browser as Settings lists it. */
export interface SignInView {
  id: string;
  name: string;
  kind: SignInKind;
  pairedAt: number;
  lastUsedAt: number;
  /** The browser asking. */
  current: boolean;
}
