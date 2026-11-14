import { BRAND } from '@teamtrail/core';
import { apiBase } from './apiBase';
import { managedSignIn } from './managedSignIn';
import { distrustServer, proveServer } from './serverProof';

type Listener = (e: Event) => void;
const MAX_RETRY_MS = 10_000;

/**
 * A server event stream (`<api>/events`, or another `path` such as a tracker's), signed in. EventSource can't send the session header, so each
 * connection first gets a single-use ticket with it (`POST /sign-in/stream`) and opens `/events?ticket=`. A ticket
 * works once, so when the connection drops this opens a new one with a new ticket (backing off to 10 s), instead
 * of EventSource's own retry; and before each, the server proves it is the Lookout (serverProof.ts). Listeners ('message', 'open', 'error' and named events) carry over.
 */
export class SessionEventSource {
  private inner?: EventSource;
  private listeners: [string, Listener][] = [];
  private closed = false;
  private retryMs = 1000;

  constructor(
    private readonly base = apiBase(),
    private readonly path = '/events',
  ) {
    void this.connect();
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners.push([type, listener]);
    this.inner?.addEventListener(type, listener);
  }

  set onmessage(fn: Listener) {
    this.addEventListener('message', fn);
  }

  set onerror(fn: Listener) {
    this.addEventListener('error', fn);
  }

  close() {
    this.closed = true;
    this.inner?.close();
  }

  private async connect() {
    if (this.closed) return;
    if (managedSignIn()) return this.open(`${this.base}${this.path}`);
    // the server proves it is this page's Lookout before the session goes out for a ticket
    if ((await proveServer()) !== 'proven') return this.failed();
    const ticket = await fetch(`${BRAND.apiPrefix}/sign-in/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then((r) => (r.ok ? (r.json() as Promise<{ ticket?: string }>) : undefined))
      .then((b) => b?.ticket)
      .catch(() => undefined);
    if (this.closed) return;
    if (!ticket) return this.failed();
    this.open(`${this.base}${this.path}?ticket=${encodeURIComponent(ticket)}`);
  }

  private open(url: string) {
    const es = new EventSource(url);
    this.inner = es;
    for (const [type, l] of this.listeners) es.addEventListener(type, l);
    es.addEventListener('open', () => (this.retryMs = 1000));
    es.addEventListener('error', () => {
      es.close();
      // dropped: whoever answers next proves itself first (the Lookout may have stopped and its port been taken)
      distrustServer();
      this.retry();
    });
  }

  /** No ticket: tell the listeners, as a dropped stream would, then try again. */
  private failed() {
    for (const [type, l] of this.listeners) if (type === 'error') l(new Event('error'));
    this.retry();
  }

  private retry() {
    if (this.closed) return;
    setTimeout(() => void this.connect(), this.retryMs);
    this.retryMs = Math.min(this.retryMs * 2, MAX_RETRY_MS);
  }
}
