import { BRAND } from '@teamtrail/core';
import { apiBase } from './apiBase';

type Listener = (e: Event) => void;
const MAX_RETRY_MS = 10_000;

/**
 * The server's event stream (`<api>/events`), signed in. EventSource can't send the session header, so each
 * connection first gets a single-use ticket with it (`POST /sign-in/stream`) and opens `/events?ticket=`. A ticket
 * works once, so when the connection drops this opens a new one with a new ticket (backing off to 10 s), instead
 * of EventSource's own retry. Listeners ('message', 'open', 'error' and named events) carry over.
 */
export class SessionEventSource {
  private inner?: EventSource;
  private listeners: [string, Listener][] = [];
  private closed = false;
  private retryMs = 1000;

  constructor(private readonly base = apiBase()) {
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
    const es = new EventSource(`${this.base}/events?ticket=${encodeURIComponent(ticket)}`);
    this.inner = es;
    for (const [type, l] of this.listeners) es.addEventListener(type, l);
    es.addEventListener('open', () => (this.retryMs = 1000));
    es.addEventListener('error', () => {
      es.close();
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
