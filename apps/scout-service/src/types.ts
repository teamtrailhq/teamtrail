/** Types shared by the Scout service's modules. Nothing here holds message text: only ids, hashes and sealed tokens. */

import type { Envelope } from '@teamtrail/connector-slack/node';

export interface ServiceConfig {
  port: number;
  /** Where Slack and browsers reach this service, e.g. https://scout.teamtrail.app (no trailing slash). */
  publicUrl: string;
  slackClientId: string;
  slackClientSecret: string;
  slackSigningSecret: string;
  /** 32 bytes: seals bot tokens at rest (AES-256-GCM). */
  tokenKey: Buffer;
  /** Postgres; undefined only with the in-memory store (dev and tests). */
  databaseUrl?: string;
  /** Read the client address from `X-Forwarded-For` (behind Railway's proxy). Required in production. */
  trustProxy: boolean;
  /** TLS to Postgres: verified, without verifying the certificate, or off (Railway's private network). */
  databaseSsl: 'verify' | 'no-verify' | 'off';
  /** Slack's Web API base, ending in `/api`. */
  slackApiUrl: string;
  slackAuthorizeUrl: string;
  /** The only origin a `response_url` may have. */
  slackHooksOrigin: string;
}

/** A workspace Scout is installed in. */
export interface Workspace {
  teamId: string;
  teamName: string;
  botUserId: string;
  /** Sealed with the token key (`TokenCipher`), bound to the team id. */
  botToken: string;
  scopes: string[];
  installedBy: string;
  installedAt: number;
}

/** One Teamtrail machine linked to one Slack account in one workspace. */
export interface Link {
  id: string;
  teamId: string;
  userId: string;
  /** SHA-256 of the link token; the token itself is only ever with the Teamtrail that holds it. */
  tokenHash: string;
  createdAt: number;
  lastSeenAt?: number;
}

/** An install started from a Lookout, waiting for Slack's OAuth callback (keyed by the state's hash). */
export interface PendingInstall {
  stateHash: string;
  /**
   * The Lookout's PKCE challenge: base64url SHA-256 of a verifier only that Lookout's server holds. Empty, with an
   * empty `returnUrl`, for an install started from Slack (`/install-slack`), which installs Scout and links no one.
   */
  challenge: string;
  returnUrl: string;
  expiresAt: number;
}

/** The one-time code a finished install hands back to the Lookout, exchanged with the verifier for a link. */
export interface PendingCode {
  codeHash: string;
  challenge: string;
  teamId: string;
  userId: string;
  expiresAt: number;
}

/**
 * What a link owns, so its calls and Slack's clicks can be checked against it. Every link in a workspace shares
 * one bot, so "Scout posted it" proves nothing about which Teamtrail did:
 * - `message`: `<channel>:<ts>` of a message the link posted (chat.update, clicks on it);
 * - `view`: a modal or Home tab view id the link opened or published (views.update, clicks and submissions in it);
 * - `dm`: the owner's DM channel id, as `conversations.open` answered it for the link (posts to it);
 * - `thread`: `<channel>:<ts>` of a message a "Save as decision" shortcut delivered to the link (reading the thread).
 */
export type MarkKind = 'message' | 'view' | 'dm' | 'thread';

export interface Mark {
  kind: MarkKind;
  key: string;
  linkId: string;
  expiresAt: number;
}

export interface ServiceStore {
  saveWorkspace(w: Workspace): Promise<void>;
  workspace(teamId: string): Promise<Workspace | undefined>;
  /** Removes the workspace and its links; resolves to the removed link ids. */
  removeWorkspace(teamId: string): Promise<string[]>;
  saveLink(l: Link): Promise<void>;
  link(id: string): Promise<Link | undefined>;
  linkByTokenHash(hash: string): Promise<Link | undefined>;
  linksOf(teamId: string, userId: string): Promise<Link[]>;
  removeLink(id: string): Promise<void>;
  touchLink(id: string, at: number): Promise<void>;
  saveInstall(p: PendingInstall): Promise<void>;
  /** Single use: the install is gone after this, and an expired one resolves to undefined. */
  takeInstall(stateHash: string, now: number): Promise<PendingInstall | undefined>;
  saveCode(c: PendingCode): Promise<void>;
  /** Single use, like `takeInstall`. */
  takeCode(codeHash: string, now: number): Promise<PendingCode | undefined>;
  /** The code without using it up, while it is unexpired: for showing who it belongs to before the exchange. */
  peekCode(codeHash: string, now: number): Promise<PendingCode | undefined>;
  /** Remembers that a link owns something (a message it posted, a view it opened…) until the mark expires. */
  mark(m: Mark): Promise<void>;
  /** The links holding an unexpired mark of this kind on this key. */
  marked(kind: MarkKind, key: string, now: number): Promise<string[]>;
  /** Drops expired installs, codes and marks. */
  purge(now: number): Promise<void>;
  close(): Promise<void>;
}

/** Log fields: ids, names of methods, counts and timings. Never message text or tokens. */
export type LogFields = Record<string, string | number | boolean | undefined>;
export type Logger = (event: string, fields?: LogFields) => void;

/** Messages a linked Teamtrail sends over its socket. */
export type ClientMessage =
  | { type: 'hello'; token: string }
  | { type: 'call'; id: string; method: string; args?: Record<string, unknown> }
  | { type: 'ack'; id: string; ack?: unknown };

/** Messages the service sends to a linked Teamtrail. */
export type ServerMessage =
  | { type: 'ready'; linkId: string; teamId: string; userId: string; botUserId: string; scopes: string[] }
  | { type: 'envelope'; id: string; envelope: Envelope }
  | { type: 'result'; id: string; ok: true; response: unknown }
  | { type: 'result'; id: string; ok: false; error: string }
  | { type: 'closed'; reason: 'unknown-link' | 'uninstalled' | 'disconnected' | 'replaced' | 'too-fast' };
