import { SlackApiError } from '../api';
import { LinkCalls } from './linkCalls';
import type {
  ClientMessage,
  Envelope,
  EnvelopeResult,
  LinkClosed,
  LinkReady,
  ServerMessage,
  WebSocketCtor,
  WebSocketLike,
} from './types';

export type LinkState = 'connecting' | 'online' | 'offline' | 'auth-error';

export interface ScoutLinkOptions {
  /** The service's `/connect` address (ws: or wss:). */
  url: string;
  /** This Teamtrail's link token: sent in the first message, never in the address. */
  token: string;
  WebSocket: WebSocketCtor;
  onEnvelope: (e: Envelope) => Promise<EnvelopeResult | void>;
  onState: (s: LinkState, error?: string) => void;
  onReady?: (r: LinkReady) => void;
  backoffMs?: (attempt: number) => number;
  callTimeoutMs?: number;
}

/** What the trail lead reads when the service closed the link for good. */
const CLOSED: Record<Exclude<LinkClosed, 'too-fast'>, string> = {
  'unknown-link': 'Scout no longer knows this Teamtrail. Connect again with Add Scout to Slack.',
  uninstalled: 'Scout was removed from this Slack workspace. Add it again to connect.',
  disconnected: 'This Teamtrail was disconnected from Scout.',
  replaced: 'Your Slack account connected Scout on more machines since; this one was let go. Connect again.',
};

function text(d: unknown) {
  if (typeof d === 'string') return d;
  if (d instanceof ArrayBuffer) return new TextDecoder().decode(d);
  return '';
}

/**
 * The outbound connection from this Teamtrail to the Scout service: Slack's requests arrive as envelopes and are
 * acked, and Slack calls go out and come back as results. Reconnects with backoff and the same token, so the
 * service keeps it the same link (its earlier messages stay live), until the service closes it for good.
 */
export class ScoutLink {
  private ws?: WebSocketLike;
  private stopped = true;
  private attempt = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private ready?: LinkReady;
  private calls: LinkCalls;
  private work = new Set<Promise<void>>();

  constructor(private o: ScoutLinkOptions) {
    this.calls = new LinkCalls(o.callTimeoutMs ?? 15_000);
  }

  get linkId() {
    return this.ready?.linkId;
  }

  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.drop();
  }

  async idle() {
    while (this.work.size) await Promise.allSettled([...this.work]);
  }

  /** A Slack Web API call made by the service with this workspace's bot token. */
  async call<T>(method: string, args: Record<string, unknown> = {}): Promise<T> {
    const ws = this.ws;
    if (!ws || !this.ready || ws.readyState !== 1) throw new SlackApiError('offline', method);
    const { id, result } = this.calls.open(method);
    this.send(ws, { type: 'call', id, method, args });
    return (await result) as T;
  }

  private connect() {
    if (this.stopped) return;
    this.o.onState('connecting');
    const ws = new this.o.WebSocket(this.o.url);
    this.ws = ws;
    ws.addEventListener('open', () => this.send(ws, { type: 'hello', token: this.o.token }));
    ws.addEventListener('message', (e) => this.onMessage(ws, text(e.data)));
    ws.addEventListener('close', () => {
      if (this.ws !== ws) return;
      this.ws = undefined;
      this.ready = undefined;
      this.calls.failAll('offline');
      this.retry();
    });
    ws.addEventListener('error', () => {});
  }

  private drop() {
    const ws = this.ws;
    this.ws = undefined;
    this.ready = undefined;
    this.calls.failAll('offline');
    if (ws && ws.readyState <= 1) ws.close(1000, 'stopped');
  }

  private retry() {
    if (this.stopped) return;
    this.o.onState('offline');
    const ms = this.o.backoffMs?.(this.attempt) ?? Math.min(30_000, 1000 * 2 ** this.attempt);
    this.attempt++;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), ms);
    (this.timer as { unref?: () => void }).unref?.();
  }

  private send(ws: WebSocketLike, m: ClientMessage) {
    if (ws.readyState === 1) ws.send(JSON.stringify(m));
  }

  private onMessage(ws: WebSocketLike, raw: string) {
    let m: ServerMessage;
    try {
      m = JSON.parse(raw) as ServerMessage;
    } catch {
      return;
    }
    if (this.ws !== ws) return;
    if (m.type === 'ready') return this.onReady(m);
    if (m.type === 'result') return this.calls.settle(m);
    if (m.type === 'envelope') return this.onEnvelope(ws, m.id, m.envelope);
    if (m.type === 'closed') return this.onClosed(m.reason);
  }

  private onReady(m: LinkReady) {
    this.attempt = 0;
    this.ready = { linkId: m.linkId, teamId: m.teamId, userId: m.userId, botUserId: m.botUserId };
    this.o.onReady?.(this.ready);
    this.o.onState('online');
  }

  private onClosed(reason: LinkClosed) {
    if (reason === 'too-fast') {
      this.drop();
      return this.retry();
    }
    this.stopped = true;
    this.drop();
    this.o.onState('auth-error', CLOSED[reason] ?? CLOSED['unknown-link']);
  }

  private onEnvelope(ws: WebSocketLike, id: string, envelope: Envelope) {
    const job = (async () => {
      let result: EnvelopeResult | void;
      try {
        result = await this.o.onEnvelope(envelope);
      } catch {
        result = undefined;
      }
      this.send(ws, { type: 'ack', id, ...(result?.ack === undefined ? {} : { ack: result.ack }) });
      await result?.after?.().catch(() => {});
    })();
    this.work.add(job);
    void job.finally(() => this.work.delete(job));
  }
}
