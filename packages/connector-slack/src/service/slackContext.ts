import { AS_WRITTEN, SlackApiError } from '../api';
import { ScoutLink } from '../link/scoutLink';
import { scoutService } from '../link/scoutService';
import type { LinkReady, WebSocketCtor } from '../link/types';
import { settingStore } from '../settingStore';
import { approvalStore, askStore, slackLock, slackStore } from '../store';
import type { SlackState } from '../types';
import type { PendingConnect } from './connectState';
import { AUTH_CODES } from './constants';
import { deliveryLog } from './deliveryLog';
import { onEnvelope } from './interactions';
import { refusedForGood } from './refusedForGood';
import type { Batch, Env, TrailNotes, Payload, SlackServiceOptions } from './types';
import { learnWorkspace } from './workspace';

/** Every message Scout posts or edits goes out as written (`AS_WRITTEN`). */
const POSTS = new Set(['chat.postMessage', 'chat.postEphemeral', 'chat.update']);

/** State of the Slack connection shared by the service modules: config, the link to the Scout service and caches. */
export class SlackContext {
  readonly store;
  readonly lock;
  readonly asks;
  readonly env: Env;
  readonly scout;
  readonly WS?: WebSocketCtor;
  link?: ScoutLink;
  /** Who this Teamtrail is at the Scout service, once its link is ready. */
  ready?: LinkReady;
  state: SlackState = 'off';
  error?: string;
  heldBy?: string;
  readonly dms = new Map<string, string>();
  readonly names = new Map<string, string>();
  readonly handles = new Map<string, string>();
  /** Questions an answer was already delivered for. */
  readonly answering = new Set<string>();
  readonly trails = new Map<string, TrailNotes>();
  readonly batches = new Map<string, Batch>();
  /** Questions already put in a trail digest instead of their own message (interrupt gating). */
  readonly digested = new Set<string>();
  /** Approval messages with live buttons, kept across restarts. */
  readonly approvals;
  /** Setting request cards with live buttons, kept across restarts. */
  readonly settingRequests;
  /** Messages Slack refused for good, until one gets through. */
  readonly delivery;
  /** Approval messages already brought up to date by this process. */
  readonly refreshed = new Set<string>();
  /** Questions that went over the per-agent limit: they stay in the digest and never get their own message. */
  readonly capped = new Set<string>();
  /** When each agent's questions were posted as their own message, for the limit (askLimit.ts). */
  readonly askLog: { agent: string; at: number }[] = [];
  /** Add Scout to Slack, started here and waiting for the browser to come back: the PKCE verifier, in memory only. */
  connecting?: PendingConnect;
  /** Just connected: greet the owner in their DM once the link is ready. */
  greetOwner = false;
  ticks = 0;
  ticking?: Promise<void>;

  constructor(readonly o: SlackServiceOptions) {
    this.env = o.env ?? process.env;
    this.store = slackStore(o.configDir);
    this.lock = slackLock(o.configDir, o.lockOwner ?? `${process.pid}:${o.root}`);
    this.asks = askStore(o.root);
    this.approvals = approvalStore(o.root);
    this.settingRequests = settingStore(o.root);
    this.delivery = deliveryLog(o.root, () => o.now?.() ?? Date.now());
    this.scout = scoutService(this.env);
    this.WS = o.WebSocket ?? (globalThis as { WebSocket?: WebSocketCtor }).WebSocket;
  }

  start() {
    if (this.link) return;
    const linked = this.store.link();
    if (!linked || !this.store.read().enabled) {
      this.state = 'off';
      return;
    }
    if (linked.service !== this.scout.http) {
      this.state = 'other-service';
      this.error = `Connected through ${linked.service || 'an unknown Scout service'}, but this Teamtrail now points at ${this.scout.http}. Unset $TEAMTRAIL_SCOUT_SERVICE, or disconnect and add Scout again.`;
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
    this.link = new ScoutLink({
      url: this.scout.connect,
      token: linked.token,
      teamId: this.store.read().workspace?.id,
      WebSocket: this.WS,
      onEnvelope: (e) => onEnvelope(this, e),
      onReady: (r) => {
        this.ready = r;
        void learnWorkspace(this).catch(() => {});
      },
      onState: (s, err) => {
        this.state = s;
        this.error = err;
        if (s === 'auth-error') this.linkClosed(err);
      },
      backoffMs: this.o.backoffMs,
    });
    this.link.start();
  }

  stop() {
    this.link?.stop();
    this.link = undefined;
    this.ready = undefined;
    this.lock.release();
    if (this.state !== 'auth-error') this.state = 'off';
  }

  /** The service closed the link for good (disconnected elsewhere, Scout uninstalled): turned off until reconnected. */
  linkClosed(error: string | undefined) {
    this.store.update({ enabled: false });
    this.stop();
    this.state = 'auth-error';
    this.error = error;
  }

  async call<T = Payload>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    if (!this.link) throw new SlackApiError('not_connected', method);
    try {
      const r = await this.link.call<T>(method, POSTS.has(method) ? { ...args, ...AS_WRITTEN } : args);
      if (method === 'chat.postMessage') this.delivery.delivered();
      return r;
    } catch (e) {
      if (method === 'chat.postMessage' && refusedForGood(e)) this.delivery.refused((e as SlackApiError).code);
      if (e instanceof SlackApiError && AUTH_CODES.has(e.code))
        this.linkClosed('Slack no longer accepts Scout in this workspace. Add Scout to Slack again.');
      throw e;
    }
  }

  /**
   * Who may act in Slack: the owner the trail lead confirmed in the Lookout, and the members the trail lead allowed
   * there. Nobody before an owner is confirmed. `user` is the id Slack put on the payload, never one from its text.
   */
  allowed(user: string) {
    const c = this.store.read();
    if (!c.owners.length) return false;
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

  /** The unique Slack username, for showing who did something security-relevant (display names can be copied). */
  async handleOf(user: string) {
    if (!this.handles.has(user)) {
      const r = await this.call<{ user: Payload }>('users.info', { user }).catch(() => undefined);
      this.handles.set(user, (r?.user?.name as string | undefined) ?? user);
    }
    return this.handles.get(user)!;
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
