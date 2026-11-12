/**
 * The shapes the Scout service and this connector share. Slack's requests reach the connector as envelopes, in the
 * shape Slack's Socket Mode uses, and the connector answers each with an ack.
 */

export interface WebSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void;
  addEventListener(type: 'message', listener: (e: { data: unknown }) => void): void;
}
export type WebSocketCtor = new (url: string) => WebSocketLike;

export interface Envelope {
  envelope_id: string;
  type: 'events_api' | 'slash_commands' | 'interactive';
  payload: Record<string, unknown>;
  accepts_response_payload?: boolean;
}

/** What to send back within Slack's 3 s, and the slow work to do after the ack. */
export interface EnvelopeResult {
  ack?: unknown;
  after?: () => Promise<void>;
}

/** Who this Teamtrail is at the service, as its `ready` message says. */
export interface LinkReady {
  linkId: string;
  teamId: string;
  userId: string;
  botUserId: string;
  /** The bot scopes the workspace granted (services before 0.29 didn't say). */
  scopes?: string[];
}

/** Why the service closed the link for good: Teamtrail stops reconnecting and says so. */
export type LinkClosed = 'unknown-link' | 'uninstalled' | 'disconnected' | 'replaced' | 'too-fast';

/** Messages this Teamtrail sends over its socket. */
export type ClientMessage =
  | { type: 'hello'; token: string }
  | { type: 'call'; id: string; method: string; args?: Record<string, unknown> }
  | { type: 'ack'; id: string; ack?: unknown };

/** Messages the service sends. */
export type ServerMessage =
  | ({ type: 'ready' } & LinkReady)
  | { type: 'envelope'; id: string; envelope: Envelope }
  | { type: 'result'; id: string; ok: true; response: unknown }
  | { type: 'result'; id: string; ok: false; error: string }
  | { type: 'closed'; reason: LinkClosed };
