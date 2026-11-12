import { randomUUID } from 'node:crypto';
import type { Envelope } from '@teamtrail/connector-slack/node';
import type { RawData, WebSocket } from 'ws';
import { RateLimit } from '../http/RateLimit';
import { LIMITS } from '../limits';
import type { ClientMessage, Link, ServerMessage } from '../types';
import { parseClientMessage } from './parseClientMessage';
import type { CallResult } from './proxyCall';

export interface LinkSocketOptions {
  /** The client address key (IPv6 by /64), for the cap on sockets that haven't said hello. */
  address: string;
  /** The link a hello's token belongs to. */
  authenticate: (token: string) => Promise<Link | undefined>;
  ready: (s: LinkSocket) => void;
  closed: (s: LinkSocket) => void;
  call: (s: LinkSocket, c: { method: string; args: unknown }) => Promise<CallResult>;
  now: () => number;
}

type Closing = Extract<ServerMessage, { type: 'closed' }>['reason'];

const size = (data: RawData) => (Array.isArray(data) ? data.reduce((n, b) => n + b.length, 0) : data.byteLength);

/**
 * One linked Teamtrail's socket. Its first message must be a small hello with a link token; until `ready`,
 * nothing else is read. After it, messages are rate limited (past the limit the socket closes `too-fast`), and
 * anything that isn't an ack or a call is dropped.
 */
export class LinkSocket {
  link?: Link;
  connectedAt = 0;
  private acks = new Map<string, (ack: unknown) => void>();
  private alive = true;
  private greeted = false;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private rate: RateLimit;

  constructor(
    private ws: WebSocket,
    readonly o: LinkSocketOptions,
  ) {
    this.rate = new RateLimit({ burst: LIMITS.socketBurst, perMinute: LIMITS.socketPerMinute, now: o.now });
    ws.on('message', (data, binary) => void this.receive({ text: binary ? '' : String(data), bytes: size(data) }));
    ws.on('pong', () => (this.alive = true));
    ws.on('close', () => this.ended());
    ws.on('error', () => ws.terminate());
    this.timers.push(setTimeout(() => this.link || this.close('unknown-link'), LIMITS.helloMs));
    this.timers.push(setInterval(() => this.heartbeat(), LIMITS.pingMs));
  }

  get open() {
    return this.ws.readyState === this.ws.OPEN;
  }

  /** Sends Slack's request on and resolves with the Teamtrail's ack, or undefined when none came in time. */
  deliver(envelope: Envelope): Promise<unknown> {
    const id = randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.settle(id, undefined), LIMITS.ackMs);
      this.acks.set(id, (ack) => {
        clearTimeout(timer);
        resolve(ack);
      });
      this.send({ type: 'envelope', id, envelope });
    });
  }

  close(reason: Closing) {
    this.send({ type: 'closed', reason });
    this.ws.close(4000, reason);
  }

  send(m: ServerMessage) {
    if (this.open) this.ws.send(JSON.stringify(m));
  }

  private settle(id: string, ack: unknown) {
    const resolve = this.acks.get(id);
    this.acks.delete(id);
    resolve?.(ack);
  }

  private async receive(m: { text: string; bytes: number }) {
    if (!this.greeted) return this.hello(m);
    if (!this.link) return;
    if (!this.rate.take('socket')) return this.close('too-fast');
    const message = parseClientMessage(m.text);
    if (message?.type === 'ack') return this.settle(message.id, message.ack);
    if (message?.type === 'call') return this.answer(message);
  }

  private async hello(m: { text: string; bytes: number }) {
    this.greeted = true;
    const message = m.bytes <= LIMITS.helloBytes ? parseClientMessage(m.text) : undefined;
    const link = message?.type === 'hello' ? await this.o.authenticate(message.token) : undefined;
    if (!link) return this.close('unknown-link');
    this.link = link;
    this.connectedAt = this.o.now();
    this.o.ready(this);
  }

  private async answer(m: Extract<ClientMessage, { type: 'call' }>) {
    const result = await this.o.call(this, { method: m.method, args: m.args });
    this.send({ type: 'result', id: m.id, ...result });
  }

  private heartbeat() {
    if (!this.alive) return this.ws.terminate();
    this.alive = false;
    this.ws.ping();
  }

  private ended() {
    for (const t of this.timers) clearTimeout(t);
    for (const id of [...this.acks.keys()]) this.settle(id, undefined);
    this.o.closed(this);
  }
}
