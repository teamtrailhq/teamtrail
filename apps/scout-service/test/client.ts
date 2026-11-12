/** A linked Teamtrail as the service sees it: a socket that says hello, acks envelopes and makes calls. */
import { WebSocket } from 'ws';

/** A message as parsed from the socket. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Json = Record<string, any>;

export interface Client {
  ws: WebSocket;
  messages: Json[];
  /** Resolves with the first message (seen or coming) that matches. */
  next(match: (m: Json) => boolean, ms?: number): Promise<Json>;
  call(method: string, args?: Record<string, unknown>): Promise<Json>;
  /** Acks every envelope with what `answer` returns. */
  answer(fn: (envelope: Json) => unknown): void;
  closed: Promise<number>;
}

let calls = 0;

export async function connect(base: string, token: string, o: { waitReady?: boolean } = {}): Promise<Client> {
  const ws = new WebSocket(`${base.replace('http', 'ws')}/connect`);
  const messages: Json[] = [];
  const waiters: { match: (m: Json) => boolean; resolve: (m: Json) => void }[] = [];
  let answer: ((e: Json) => unknown) | undefined;
  const closed = new Promise<number>((r) => ws.on('close', (code) => r(code)));
  ws.on('message', (data) => {
    const m = JSON.parse(String(data));
    messages.push(m);
    if (m.type === 'envelope' && answer) ws.send(JSON.stringify({ type: 'ack', id: m.id, ack: answer(m.envelope) }));
    for (const w of waiters.filter((x) => x.match(m))) w.resolve(m);
  });
  await new Promise((r) => ws.on('open', r));
  ws.send(JSON.stringify({ type: 'hello', token }));
  const next: Client['next'] = (match, ms = 3000) => {
    const seen = messages.find(match);
    if (seen) return Promise.resolve(seen);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('no such message')), ms);
      waiters.push({ match, resolve: (m) => (clearTimeout(t), resolve(m)) });
    });
  };
  const client: Client = {
    ws,
    messages,
    next,
    call(method, args) {
      const id = `c${++calls}`;
      ws.send(JSON.stringify({ type: 'call', id, method, args }));
      return next((m) => m.type === 'result' && m.id === id);
    },
    answer: (fn) => (answer = fn),
    closed,
  };
  if (o.waitReady !== false) await next((m) => m.type === 'ready' || m.type === 'closed');
  return client;
}
