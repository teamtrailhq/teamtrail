import { SlackApi, SlackApiError } from '../../src/api';
import type { ClientMessage, LinkClosed, WebSocketLike } from '../../src/link/types';

/** The link the tests' Teamtrail holds: test values only. */
export const LINK = { id: 'L0TEST00001', token: 'stl_test-link-token-not-a-secret', service: 'https://scout.test' };

/**
 * In-process stand-in for the Scout service's `/connect` socket. A Teamtrail says hello with its link token and gets
 * `ready`; its Slack calls are made against the fake Slack with the bot token, stamped like the service stamps
 * posts; `envelope` delivers what Slack sent and resolves with the Teamtrail's ack.
 */
export function scoutHub(o: {
  fetch: typeof fetch;
  botToken: string;
  apiUrl?: string;
  team?: string;
  user?: string;
  botUser?: string;
}) {
  const state = {
    token: LINK.token,
    user: o.user ?? 'U0ANA0001',
    team: o.team ?? 'T0EFIKA01',
    hello: 0,
    /** The scopes `ready` reports; undefined like a service before 0.29. */
    scopes: undefined as string[] | undefined,
  };
  const sockets: FakeSocket[] = [];
  const acks = new Map<string, (ack: unknown) => void>();
  const sent: string[] = [];
  const urls: string[] = [];
  let seq = 0;
  let connections = 0;
  const slack = new SlackApi({ token: o.botToken, apiUrl: o.apiUrl ?? 'https://slack.test/api', fetch: o.fetch });

  class FakeSocket implements WebSocketLike {
    readyState = 0;
    ready = false;
    private l: Record<string, ((e: { data: unknown }) => void)[]> = {};
    constructor(readonly url: string) {
      sockets.push(this);
      urls.push(url);
      connections++;
      queueMicrotask(() => {
        if (this.readyState !== 0) return;
        this.readyState = 1;
        this.emit('open');
      });
    }
    addEventListener(type: string, fn: (e: { data: unknown }) => void) {
      (this.l[type] ??= []).push(fn);
    }
    emit(type: string, e: { data: unknown } = { data: undefined }) {
      for (const fn of this.l[type] ?? []) fn(e);
    }
    reply(m: unknown) {
      queueMicrotask(() => this.readyState === 1 && this.emit('message', { data: JSON.stringify(m) }));
    }
    send(data: string) {
      const m = JSON.parse(data) as ClientMessage;
      if (m.type === 'hello') return this.hello(m.token);
      if (m.type === 'ack') {
        sent.push(m.id);
        acks.get(m.id)?.(m.ack);
        acks.delete(m.id);
        return;
      }
      if (m.type === 'call') void this.call(m);
    }
    private hello(token: string) {
      state.hello++;
      if (token !== state.token) return this.reply({ type: 'closed', reason: 'unknown-link' });
      this.ready = true;
      this.reply({
        type: 'ready',
        linkId: LINK.id,
        teamId: state.team,
        userId: state.user,
        botUserId: o.botUser ?? 'U0ScoutBOT',
        ...(state.scopes ? { scopes: state.scopes } : {}),
      });
    }
    private async call(m: { id: string; method: string; args?: Record<string, unknown> }) {
      const stamped = /^chat\.(postMessage|update)$/.test(m.method)
        ? { ...m.args, metadata: { event_type: 'scout_link', event_payload: { link: LINK.id } } }
        : m.args;
      try {
        this.reply({ type: 'result', id: m.id, ok: true, response: await slack.call(m.method, stamped) });
      } catch (e) {
        this.reply({ type: 'result', id: m.id, ok: false, error: e instanceof SlackApiError ? e.code : 'failed' });
      }
    }
    close() {
      if (this.readyState >= 2) return;
      this.readyState = 3;
      queueMicrotask(() => this.emit('close'));
    }
  }

  const live = () => sockets.filter((s) => s.readyState === 1 && s.ready).at(-1);

  return {
    state,
    /** Envelope ids acked by the Teamtrail, in send order. */
    sent,
    /** The addresses sockets were opened to. */
    urls,
    WebSocket: FakeSocket as unknown as new (url: string) => WebSocketLike,
    get connections() {
      return connections;
    },
    get open() {
      return sockets.filter((s) => s.readyState === 1 && s.ready).length;
    },
    /** Delivers what Slack sent; resolves with the ack (undefined for a bare ack). */
    envelope(e: { type: string; payload: unknown }): Promise<unknown> {
      const ws = live();
      if (!ws) throw new Error('no linked Teamtrail connected');
      const id = `env-${String(++seq).padStart(4, '0')}`;
      const p = new Promise<unknown>((r) => acks.set(id, r));
      ws.emit('message', {
        data: JSON.stringify({
          type: 'envelope',
          id,
          envelope: {
            envelope_id: id,
            type: e.type,
            payload: e.payload,
            accepts_response_payload: e.type !== 'events_api',
          },
        }),
      });
      return p;
    },
    /** Sends any frame to the newest open socket, said hello or not: what a broken or forged service could send. */
    raw(data: unknown) {
      const ws = sockets.filter((x) => x.readyState === 1).at(-1);
      ws?.emit('message', { data });
    },
    /** The service closes the link for good (or `too-fast`, after which the Teamtrail reconnects). */
    closeLink(reason: LinkClosed) {
      const ws = live();
      ws?.emit('message', { data: JSON.stringify({ type: 'closed', reason }) });
      ws?.close();
    },
    /** The socket drops without warning (a deploy of the service). */
    drop() {
      const ws = sockets.filter((s) => s.readyState === 1).at(-1);
      if (!ws) return;
      ws.readyState = 3;
      ws.emit('close');
    },
  };
}
export type ScoutHub = ReturnType<typeof scoutHub>;
