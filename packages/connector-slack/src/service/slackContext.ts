import { BRAND, overrideUrl } from '@teamtrail/core';
import { SlackApi, SlackApiError } from '../api';
import { SocketMode, type WebSocketCtor } from '../socket';
import { approvalStore, askStore, slackLock, slackStore } from '../store';
import type { SlackState } from '../types';
import { AUTH_CODES } from './constants';
import { onEnvelope } from './interactions';
import type { Batch, Env, TrailNotes, Payload, SlackServiceOptions } from './types';

/** State of the Slack connection shared by the service modules: config, socket, bot client and caches. */
export class SlackContext {
  readonly store;
  readonly lock;
  readonly asks;
  readonly env: Env;
  readonly apiUrl?: string;
  readonly WS?: WebSocketCtor;
  socket?: SocketMode;
  state: SlackState = 'off';
  error?: string;
  heldBy?: string;
  bot?: SlackApi;
  readonly dms = new Map<string, string>();
  readonly names = new Map<string, string>();
  /** Questions an answer was already delivered for. */
  readonly answering = new Set<string>();
  readonly trails = new Map<string, TrailNotes>();
  readonly batches = new Map<string, Batch>();
  /** Questions already put in a trail digest instead of their own message (interrupt gating). */
  readonly digested = new Set<string>();
  /** Approval messages with live buttons, kept across restarts. */
  readonly approvals;
  /** Approval messages already brought up to date by this process. */
  readonly refreshed = new Set<string>();
  ticks = 0;
  ticking?: Promise<void>;

  constructor(readonly o: SlackServiceOptions) {
    this.env = o.env ?? process.env;
    this.store = slackStore(o.configDir, this.env);
    this.lock = slackLock(o.configDir, o.lockOwner ?? `${process.pid}:${o.root}`);
    this.asks = askStore(o.root);
    this.approvals = approvalStore(o.root);
    this.apiUrl = o.apiUrl ?? overrideUrl(this.env, `${BRAND.slug.toUpperCase()}_SLACK_API`);
    this.WS = o.WebSocket ?? (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;
  }

  api(token: string) {
    return new SlackApi({ token, apiUrl: this.apiUrl, fetch: this.o.fetch, sleep: this.o.sleep });
  }

  start() {
    if (this.socket) return;
    const t = this.store.tokens();
    if (!t.app || !t.bot) {
      this.state = 'off';
      return;
    }
    if (!this.WS) {
      this.state = 'unsupported';
      this.error = 'Slack needs Node.js 22 or newer';
      return;
    }
    const held = this.lock.acquire(this.o.root);
    if (!held.ok) {
      this.state = 'elsewhere';
      this.heldBy = held.heldBy;
      return;
    }
    this.heldBy = undefined;
    this.error = undefined;
    this.bot = this.api(t.bot.token);
    const app = this.api(t.app.token);
    this.socket = new SocketMode({
      open: async () => (await app.call<{ url: string }>('apps.connections.open')).url,
      WebSocket: this.WS,
      onEnvelope: (e) => onEnvelope(this, e),
      onState: (s, err) => {
        this.state = s;
        this.error = err;
        if (s === 'auth-error') this.authFailed(err);
      },
      fatal: (e) =>
        e instanceof SlackApiError && (AUTH_CODES.has(e.code) || e.code === 'not_allowed_token_type')
          ? 'Slack rejected the app-level token; reconnect in Settings'
          : undefined,
      backoffMs: this.o.backoffMs,
    });
    this.socket.start();
  }

  stop() {
    this.socket?.stop();
    this.socket = undefined;
    this.bot = undefined;
    this.lock.release();
    if (this.state !== 'auth-error') this.state = 'off';
  }

  authFailed(error = 'Slack rejected the bot token; reconnect in Settings') {
    this.store.update({ enabled: false });
    this.stop();
    this.state = 'auth-error';
    this.error = error;
  }

  async call<T = Payload>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    if (!this.bot) throw new SlackApiError('not_connected', method);
    try {
      return await this.bot.call<T>(method, args);
    } catch (e) {
      if (e instanceof SlackApiError && AUTH_CODES.has(e.code)) this.authFailed();
      throw e;
    }
  }

  allowed(user: string) {
    const c = this.store.read();
    return c.owners.some((o) => o.id === user) || c.allow.some((o) => o.id === user);
  }

  async nameOf(user: string) {
    if (!this.names.has(user)) {
      const r = await this.call<{ user: Payload }>('users.info', { user }).catch(() => undefined);
      const u = r?.user;
      this.names.set(user, (u?.profile?.display_name || u?.real_name || u?.name || user) as string);
    }
    return this.names.get(user)!;
  }

  async dmOf(user: string) {
    if (!this.dms.has(user))
      this.dms.set(
        user,
        (await this.call<{ channel: { id: string } }>('conversations.open', { users: user })).channel.id,
      );
    return this.dms.get(user)!;
  }

  /** Where notifications and asks go: the owner's DM by default, or the opted-in channel. */
  async target(): Promise<string | undefined> {
    const c = this.store.read();
    if (c.notify.target !== 'dm') return c.notify.target;
    return c.owners[0] ? this.dmOf(c.owners[0].id) : undefined;
  }
}
