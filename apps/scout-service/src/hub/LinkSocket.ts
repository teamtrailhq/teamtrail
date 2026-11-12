import { randomUUID } from 'node:crypto';
import type { Envelope } from '@teamtrail/connector-slack/node';
import type { WebSocket } from 'ws';
import { LIMITS } from '../limits';
import type { ClientMessage, Link, ServerMessage } from '../types';
import { parseClientMessage } from './parseClientMessage';
import type { CallResult } from './proxyCall';

export interface LinkSocketOptions {
  /** The link a hello's token belongs to. */
  authenticate: (token: string) => Promise<Link | undefined>;
  ready: (s: LinkSocket) => void;
  closed: (s: LinkSocket) => void;
  call: (s: LinkSocket, c: { method: string; args: unknown }) => Promise<CallResult>;
  now: () => number;
}

type Closing = Extract<ServerMessage, { type: 'closed' }>['reason'];

/** One linked Teamtrail's socket: says hello with its link token, then makes calls and acks envelopes. */
export class LinkSocket {
  link?: Link;
  connectedAt = 0;
  private acks = new Map<string, (ack: unknown) => void>();
  private alive = true;
  /** The first message must be the hello; anything sent before `ready` arrives is dropped. */
  private greeted = false;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(
    private ws: WebSocket,
    private o: LinkSocketOptions,
  ) {
    ws.on('message', (data, binary) => void this.receive(binary ? '' : String(data)));
    ws.on('pong', () => (this.alive = true));
    ws.on('close', () => this.ended());
    ws.on('error', () => ws.terminate());
    this.timers.push(setTimeout(() => this.link || this.close('unknown-link'), LIMITS.helloMs));
    this.timers.push(setInterval(() => this.heartbeat(), LIMITS.pingMs));
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

  get open() {
    return this.ws.readyState === this.ws.OPEN;
  }

  send(m: ServerMessage) {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(m));
  }

  private settle(id: string, ack: unknown) {
    const resolve = this.acks.get(id);
    this.acks.delete(id);
    resolve?.(ack);
  }

  private async receive(text: string) {
    const m = parseClientMessage(text);
    if (!m) return this.ws.close(4400, 'bad message');
    if (this.greeted) return this.link ? this.handle(m) : undefined;
    this.greeted = true;
    return this.hello(m);
  }

  private handle(m: ClientMessage) {
    if (m.type === 'ack') return this.settle(m.id, m.ack);
    if (m.type === 'call') return this.answer(m);
  }

  private async hello(m: ClientMessage) {
    const link = m.type === 'hello' ? await this.o.authenticate(m.token) : undefined;
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
